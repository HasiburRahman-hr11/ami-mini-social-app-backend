import mongoose from "mongoose";
import Post from "../models/Post.js";
import {
  uploadPostMedia,
  deleteCloudinaryMedia,
} from "../services/mediaService.js";

const authorFields = "username firstName lastName profilePicture";

const isValidId = (id) => mongoose.isValidObjectId(id);

const validCaption = (caption) =>
  typeof caption === "string" && caption.length <= 2200;

const getUploadedMedia = async (files, userId) => {
  const uploaded = [];

  try {
    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;

      if (file.size > maxSize) {
        const error = new Error(
          isVideo
            ? "Each video must be 100 MB or smaller"
            : "Each image must be 10 MB or smaller",
        );
        error.statusCode = 400;
        throw error;
      }

      const media = await uploadPostMedia(file.buffer, userId, file.mimetype);

      uploaded.push(media);
    }

    return uploaded;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((media) => deleteCloudinaryMedia(media)),
    );

    throw error;
  }
};

// Create a new post.
export const createPost = async (req, res, next) => {
  let uploadedMedia = [];

  try {
    const caption = req.body.caption ?? "";
    const files = req.files ?? [];

    if (!validCaption(caption)) {
      return res.status(400).json({
        success: false,
        message: "Caption must be a string of at most 2200 characters",
      });
    }

    if (!caption.trim() && files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A post must contain a caption or media",
      });
    }

    uploadedMedia = await getUploadedMedia(files, req.user._id);

    const post = await Post.create({
      author: req.user._id,
      caption,
      media: uploadedMedia,
    });

    await post.populate("author", authorFields);

    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    // If database creation fails, remove assets already uploaded.
    if (uploadedMedia.length > 0) {
      await Promise.allSettled(
        uploadedMedia.map((media) => deleteCloudinaryMedia(media)),
      );
    }

    next(error);
  }
};

// Get one post.
export const getPostById = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId).populate("author", authorFields);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    next(error);
  }
};

// Get recent posts with pagination.


export const getPosts = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      50,
    );

    const skip = (page - 1) * limit;
    const filter = {};

    // Optional filter used by profile pages.
    if (req.query.authorId) {
      if (!/^[a-f\d]{24}$/i.test(req.query.authorId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid author ID",
        });
      }

      filter.author = req.query.authorId;
    }

    const [posts, totalPosts] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("author", "username firstName lastName profilePicture")
        .lean(),

      Post.countDocuments(filter),
    ]);

    // Get the currently authenticated user's ID, if available.
    const currentUserId = req.user?._id?.toString();

    // Add likesCount and likedByMe to every post.
    const formattedPosts = posts.map((post) => ({
      ...post,
      likesCount: post.likes?.length ?? 0,
      likedByMe: currentUserId
        ? (post.likes ?? []).some(
            (likeId) => likeId.toString() === currentUserId,
          )
        : false,
    }));

    const totalPages = Math.ceil(totalPosts / limit);

    return res.status(200).json({
      success: true,
      posts: formattedPosts,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPosts,
        totalPages,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};


// Edit a caption and/or append media.
export const updatePost = async (req, res, next) => {
  let uploadedMedia = [];

  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit another user's post",
      });
    }

    const hasCaption = Object.hasOwn(req.body, "caption");
    const files = req.files ?? [];

    if (!hasCaption && files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide a caption or new media to update",
      });
    }

    if (hasCaption && !validCaption(req.body.caption)) {
      return res.status(400).json({
        success: false,
        message: "Caption must be a string of at most 2200 characters",
      });
    }

    if (post.media.length + files.length > 10) {
      return res.status(400).json({
        success: false,
        message: "A post can contain a maximum of 10 media files",
      });
    }

    uploadedMedia = await getUploadedMedia(files, req.user._id);

    if (hasCaption) {
      post.caption = req.body.caption;
    }

    post.media.push(...uploadedMedia);

    if (!post.caption.trim() && post.media.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A post must contain a caption or media",
      });
    }

    await post.save();
    await post.populate("author", authorFields);

    return res.status(200).json({
      success: true,
      message: "Post updated successfully",
      post,
    });
  } catch (error) {
    if (uploadedMedia.length > 0) {
      await Promise.allSettled(
        uploadedMedia.map((media) => deleteCloudinaryMedia(media)),
      );
    }

    next(error);
  }
};

// Remove one media item without deleting the entire post.
export const removePostMedia = async (req, res, next) => {
  try {
    const { postId, mediaId } = req.params;

    if (!isValidId(postId) || !isValidId(mediaId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post or media ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit another user's post",
      });
    }

    const media = post.media.id(mediaId);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "Media not found in this post",
      });
    }

    if (post.media.length === 1 && !post.caption.trim()) {
      return res.status(400).json({
        success: false,
        message: "Add a caption before removing the last media item",
      });
    }

    const mediaToDelete = media.toObject();

    post.media.pull({ _id: mediaId });
    await post.save();

    try {
      await deleteCloudinaryMedia(mediaToDelete);
    } catch (error) {
      // The database update succeeded; the asset can be cleaned up later.
      console.error("Cloudinary media cleanup failed:", error.message);
    }

    await post.populate("author", authorFields);

    return res.status(200).json({
      success: true,
      message: "Post media removed successfully",
      post,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a post and clean up its media.
export const deletePost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot delete another user's post",
      });
    }

    const mediaToDelete = post.media.map((media) => media.toObject());

    await post.deleteOne();

    const cleanupResults = await Promise.allSettled(
      mediaToDelete.map((media) => deleteCloudinaryMedia(media)),
    );

    const failedCleanupCount = cleanupResults.filter(
      (result) => result.status === "rejected",
    ).length;

    return res.status(200).json({
      success: true,
      message: "Post deleted successfully",
      cleanupPending: failedCleanupCount > 0,
    });
  } catch (error) {
    next(error);
  }
};
