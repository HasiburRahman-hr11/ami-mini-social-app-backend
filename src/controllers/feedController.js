import Post from "../models/Post.js";
import User from "../models/User.js";

const authorFields = "username firstName lastName profilePicture";

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

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

// Hide the raw likes array and return useful like information instead.
const formatPosts = (posts, currentUserId) => {
  return posts.map((post) => {
    const likes = post.likes ?? [];

    const likedByMe = likes.some(
      (userId) => userId.toString() === currentUserId.toString(),
    );

    const { likes: ignoredLikes, ...safePost } = post;

    return {
      ...safePost,
      likesCount: likes.length,
      likedByMe,
    };
  });
};

const paginationMetadata = (page, limit, totalPosts) => ({
  currentPage: page,
  pageSize: limit,
  totalPosts,
  totalPages: Math.ceil(totalPosts / limit),
  hasNextPage: page * limit < totalPosts,
});

// GET /api/posts/feed
// export const getFeed = async (req, res, next) => {
//   try {
//     const { page, limit } = res.locals.validated;
//     const skip = (page - 1) * limit;

//     const pagination = {
//       page,
//       limit,
//       skip,
//     };

//     const currentUserId = req.user._id;

//     // Load the current user's follow list.
//     const currentUser = await User.findById(currentUserId)
//       .select("following")
//       .lean();

//     if (!currentUser) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Ignore accounts that have been deactivated.
//     const activeFollowing = await User.find({
//       _id: { $in: currentUser.following ?? [] },
//       isActive: true,
//     })
//       .select("_id")
//       .lean();

//     let posts = [];
//     let totalPosts = 0;

//     if (activeFollowing.length > 0) {
//       // CASE 1: The user follows active accounts.
//       const followingIds = activeFollowing.map((user) => user._id);

//       const filter = {
//         author: {
//           $in: followingIds,
//           $ne: currentUserId,
//         },
//       };

//       [posts, totalPosts] = await Promise.all([
//         Post.find(filter)
//           .sort({ createdAt: -1, _id: -1 })
//           .skip(pagination.skip)
//           .limit(pagination.limit)
//           .populate({
//             path: "author",
//             select: authorFields,
//             match: { isActive: true },
//           })
//           .lean(),

//         Post.countDocuments(filter),
//       ]);

//       // With normal follow relationships, every author here is active.
//       // This also safely handles legacy posts from inactive accounts.
//       posts = posts.filter((post) => post.author);
//     } else {
//       // CASE 2: The user follows nobody active.
//       // Show a random selection of posts by other active users.
//       const activeAuthors = await User.find({
//         isActive: true,
//         _id: { $ne: currentUserId },
//       })
//         .select("_id")
//         .lean();

//       const activeAuthorIds = activeAuthors.map((user) => user._id);

//       if (activeAuthorIds.length > 0) {
//         const filter = {
//           author: { $in: activeAuthorIds },
//         };

//         totalPosts = await Post.countDocuments(filter);

//         if (totalPosts > 0) {
//           // Sample enough records to cover the requested page.
//           const sampledPosts = await Post.aggregate([
//             { $match: filter },
//             { $sample: { size: pagination.skip + pagination.limit } },
//             { $project: { _id: 1 } },
//           ]);

//           const sampledIds = sampledPosts
//             .slice(pagination.skip, pagination.skip + pagination.limit)
//             .map((post) => post._id);

//           const fetchedPosts = await Post.find({
//             _id: { $in: sampledIds },
//           })
//             .populate({
//               path: "author",
//               select: authorFields,
//               match: { isActive: true },
//             })
//             .lean();

//           // find() does not preserve the order of the sampled IDs.
//           const postMap = new Map(
//             fetchedPosts
//               .filter((post) => post.author)
//               .map((post) => [post._id.toString(), post]),
//           );

//           posts = sampledIds
//             .map((id) => postMap.get(id.toString()))
//             .filter(Boolean);
//         }
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       mode: activeFollowing.length > 0 ? "following" : "discover",
//       data: {
//         posts: formatPosts(posts, currentUserId),
//         pagination: paginationMetadata(
//           pagination.page,
//           pagination.limit,
//           totalPosts,
//         ),
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };


export const getFeed = async (req, res, next) => {
  try {
    const { page, limit } = res.locals.validated;
    const skip = (page - 1) * limit;

    const pagination = {
      page,
      limit,
      skip,
    };

    const currentUserId = req.user._id;

    // Get all active user IDs.
    const activeAuthors = await User.find({
      isActive: true,
    })
      .select("_id")
      .lean();

    const activeAuthorIds = activeAuthors.map((user) => user._id);

    // Return posts created by active users, newest first.
    const filter = {
      author: { $in: activeAuthorIds },
    };

    const [posts, totalPosts] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "author",
          select: authorFields,
          match: { isActive: true },
        })
        .lean(),

      Post.countDocuments(filter),
    ]);

    // Ignore posts whose author is inactive or missing.
    const activePosts = posts.filter((post) => post.author);

    return res.status(200).json({
      success: true,
      mode: "all",
      data: {
        posts: formatPosts(activePosts, currentUserId),
        pagination: paginationMetadata(
          pagination.page,
          pagination.limit,
          totalPosts,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
};

