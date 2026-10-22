
import crypto from "node:crypto";
import User from "../models/User.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import { clearAuthCookies } from "../utils/authCookies.js";

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      newPassword.length < 8 ||
      newPassword.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide your current password and a new password of 8–128 characters",
      });
    }

    const user = await User.findById(req.user._id).select(
      "+password +refreshTokenHash"
    );

    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    user.refreshTokenHash = undefined;

    await user.save();

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const genericResponse = {
      success: true,
      message:
        "If an account exists with that email, password reset instructions will be sent.",
    };

    if (!email || email.length > 254) {
      return res.status(200).json(genericResponse);
    }

    const user = await User.findOne({
      email,
      isActive: true,
    });

    // Do not reveal whether an email belongs to an account.
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordTokenHash = hashToken(resetToken);
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const clientUrl = process.env.CLIENT_URL;

    if (!clientUrl) {
      throw new Error("CLIENT_URL is not configured");
    }

    const resetUrl = new URL("/reset-password", clientUrl);
    resetUrl.searchParams.set("token", resetToken);

    try {
      await sendPasswordResetEmail(user.email, resetUrl.toString());
    } catch (error) {
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      throw error;
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(token) ||
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      newPassword.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset request",
      });
    }

    const tokenHash = hashToken(token);

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
      isActive: true,
    }).select("+resetPasswordTokenHash +resetPasswordExpires +refreshTokenHash");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired",
      });
    }

    user.password = newPassword;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokenHash = undefined;

    await user.save();

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in.",
    });
  } catch (error) {
    next(error);
  }
};
