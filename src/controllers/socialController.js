import mongoose from "mongoose";
import Post from "../models/Post.js";
import User from "../models/User.js";

const publicUserFields = "username firstName lastName profilePicture bio";

const isValidId = (id) => mongoose.isValidObjectId(id);

const getPagination = (query) => {
  const page = Number.parseInt(query.page ?? "1", 10);
  const limit = Number.parseInt(query.limit ?? "10", 10);

  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 50
  ) {
    return null;
  }

  return { page, limit, skip: (page - 1) * limit };
};

// Return a consistent pagination structure.
const paginationResult = (page, limit, total) => ({
  currentPage: page,
  pageSize: limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
});

// LIKE A POST
export const likePost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    // $addToSet prevents the same user from being added twice.
    const post = await Post.findOneAndUpdate(
      { _id: postId },
      { $addToSet: { likes: req.user._id } },
      { new: true },
    ).populate("author", publicUserFields);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Post liked successfully",
      data: {
        post,
        likesCount: post.likes.length,
        likedByMe: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// UNLIKE A POST
export const unlikePost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findOneAndUpdate(
      { _id: postId },
      { $pull: { likes: req.user._id } },
      { new: true },
    ).populate("author", publicUserFields);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Post unliked successfully",
      data: {
        post,
        likesCount: post.likes.length,
        likedByMe: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET USERS WHO LIKED A POST
export const getPostLikes = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const pagination = getPagination(req.query);

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const post = await Post.findById(postId).select("likes").lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const total = post.likes.length;
    const ids = post.likes.slice(
      pagination.skip,
      pagination.skip + pagination.limit,
    );

    const foundUsers = await User.find({
      _id: { $in: ids },
      isActive: true,
    })
      .select(publicUserFields)
      .lean();

    // Preserve the order of IDs stored on the post.
    const userMap = new Map(
      foundUsers.map((user) => [user._id.toString(), user]),
    );
    const users = ids.map((id) => userMap.get(id.toString())).filter(Boolean);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: paginationResult(pagination.page, pagination.limit, total),
      },
    });
  } catch (error) {
    next(error);
  }
};

// FOLLOW A USER
export const followUser = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (userId === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself",
      });
    }

    let targetUser;

    await session.withTransaction(async () => {
      targetUser = await User.findOne({
        _id: userId,
        isActive: true,
      })
        .select("_id")
        .session(session);

      if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      // Update both sides together so they remain consistent.
      await User.updateOne(
        { _id: currentUserId, isActive: true },
        { $addToSet: { following: targetUser._id } },
        { session },
      );

      await User.updateOne(
        { _id: targetUser._id },
        { $addToSet: { followers: currentUserId } },
        { session },
      );
    });

    const [currentUser, updatedTarget] = await Promise.all([
      User.findById(currentUserId).select("following").lean(),
      User.findById(userId).select("followers").lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: "User followed successfully",
      data: {
        following: true,
        followingCount: currentUser?.following.length ?? 0,
        followersCount: updatedTarget?.followers.length ?? 0,
      },
    });
  } catch (error) {
    console.error("Follow/unfollow error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};

// UNFOLLOW A USER
export const unfollowUser = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (userId === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot unfollow yourself",
      });
    }

    let targetUser;

    await session.withTransaction(async () => {
      targetUser = await User.findOne({
        _id: userId,
        isActive: true,
      })
        .select("_id")
        .session(session);

      if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      await User.updateOne(
        { _id: currentUserId },
        { $pull: { following: targetUser._id } },
        { session },
      );

      await User.updateOne(
        { _id: targetUser._id },
        { $pull: { followers: currentUserId } },
        { session },
      );
    });

    const [currentUser, updatedTarget] = await Promise.all([
      User.findById(currentUserId).select("following").lean(),
      User.findById(userId).select("followers").lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: "User unfollowed successfully",
      data: {
        following: false,
        followingCount: currentUser?.following.length ?? 0,
        followersCount: updatedTarget?.followers.length ?? 0,
      },
    });
  } catch (error) {
    console.error("Follow/unfollow error:", error);
    next(error);
  } finally {
    await session.endSession();
  }
};

// GET A USER'S FOLLOWERS OR FOLLOWING LIST
const getRelationshipUsers = async (req, res, next, relationship) => {
  try {
    const { userId } = req.params;
    const pagination = getPagination(req.query);

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const user = await User.findOne({
      _id: userId,
      isActive: true,
    })
      .select(relationship)
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const ids = user[relationship] ?? [];
    const total = ids.length;
    const pageIds = ids.slice(
      pagination.skip,
      pagination.skip + pagination.limit,
    );

    const foundUsers = await User.find({
      _id: { $in: pageIds },
      isActive: true,
    })
      .select(publicUserFields)
      .lean();

    const userMap = new Map(
      foundUsers.map((item) => [item._id.toString(), item]),
    );
    const users = pageIds
      .map((id) => userMap.get(id.toString()))
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: paginationResult(pagination.page, pagination.limit, total),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFollowers = (req, res, next) =>
  getRelationshipUsers(req, res, next, "followers");

export const getFollowing = (req, res, next) =>
  getRelationshipUsers(req, res, next, "following");

// export const getSuggestedUsers = async (req, res, next) => {
//   try {
//     const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
//     const limit = Math.min(
//       Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
//       50,
//     );

//     const skip = (page - 1) * limit;
//     const currentUserId = req.user._id;

//     const currentUser = await User.findById(currentUserId)
//       .select("following")
//       .lean();

//     if (!currentUser) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found.",
//       });
//     }

//     const followingIds = currentUser.following || [];

//     const filter = {
//       _id: {
//         $ne: currentUserId,
//         $nin: followingIds,
//       },
//       isActive: true,
//     };

//     const [users, total] = await Promise.all([
//       User.find(filter)
//         .select("_id username firstName lastName profilePicture bio")
//         .sort({ createdAt: -1, _id: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean(),

//       User.countDocuments(filter),
//     ]);

//     const totalPages = Math.ceil(total / limit);

//     return res.status(200).json({
//       success: true,
//       data: {
//         users,
//         pagination: {
//           currentPage: page,
//           pageSize: limit,
//           total,
//           totalPages,
//           hasNextPage: page < totalPages,
//         },
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const getSuggestedUsers = async (req, res, next) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Please log in to view suggestions.",
      });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      50,
    );

    const skip = (page - 1) * limit;

    const currentUser = await User.findById(req.user._id)
      .select("_id following")
      .lean();

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: "Your session is invalid. Please log in again.",
      });
    }

    const followingIds = currentUser.following || [];

    const filter = {
      _id: {
        $ne: currentUser._id,
        $nin: followingIds,
      },
      isActive: true,
    };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id username firstName lastName profilePicture bio")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          pageSize: limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
