import { Router } from "express";

import authMiddleware from "../middlewares/authMiddleware.js";
import upload from "../middlewares/postUploadMiddleware.js";

import {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  removePostMedia,
  deletePost,
} from "../controllers/postController.js";

import {
  likePost,
  unlikePost,
  getPostLikes,
} from "../controllers/socialController.js";

import { getFeed } from "../controllers/feedController.js";

import { paginationSchema } from "../validators/commonValidators.js";
import { validate } from "../middlewares/validateMiddleware.js";

const router = Router();

router.get(
  "/feed",
  authMiddleware,
  validate(paginationSchema, "query"),
  getFeed
);

// Public read endpoints
router.get("/", authMiddleware, getPosts);
router.get("/:postId", getPostById);

// Protected write endpoints
router.post("/", authMiddleware, upload.array("media", 10), createPost);

router.patch("/:postId", authMiddleware, upload.array("media", 10), updatePost);

router.delete("/:postId/media/:mediaId", authMiddleware, removePostMedia);

router.delete("/:postId", authMiddleware, deletePost);

router.put("/:postId/like", authMiddleware, likePost);
router.delete("/:postId/like", authMiddleware, unlikePost);

router.get("/:postId/likes", getPostLikes);

export default router;
