
import { Router } from "express";
import rateLimit from "express-rate-limit";

import authMiddleware from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

import {
  getPublicProfile,
  updateProfile,
  updateProfilePicture,
} from "../controllers/userController.js";

import { changePassword } from "../controllers/passwordController.js";

import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getSuggestedUsers,
} from "../controllers/socialController.js";

const router = Router();

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
router.get("/suggestions", authMiddleware, getSuggestedUsers);
router.patch("/me", authMiddleware, updateProfile);

router.patch(
  "/me/profile-picture",
  authMiddleware,
  upload.single("profilePicture"),
  updateProfilePicture
);

router.patch("/me/password", authMiddleware, changePassword);

router.get("/:username", profileLimiter, getPublicProfile);
router.put("/:userId/follow", authMiddleware, followUser);
router.delete("/:userId/follow", authMiddleware, unfollowUser);

router.get("/:userId/followers", getFollowers);
router.get("/:userId/following", getFollowing);

export default router;
