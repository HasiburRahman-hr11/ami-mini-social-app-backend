
import crypto from "node:crypto";
import User from "../models/User.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import {
  setAuthCookies,
  clearAuthCookies,
} from "../utils/authCookies.js";

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const publicUserFields =
  "username email firstName lastName age gender country city profilePicture bio hobbies followers following createdAt";

const normalizeRequiredString = (value) =>
  typeof value === "string" ? value.trim() : "";

const register = async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      age,
      gender,
      country,
      city,
      profilePicture,
      bio,
      hobbies,
    } = req.body;

    const normalizedUsername =
      normalizeRequiredString(username).toLowerCase();

    const normalizedEmail =
      normalizeRequiredString(email).toLowerCase();

    if (
      !normalizedUsername ||
      !normalizedEmail ||
      !password ||
      !normalizeRequiredString(firstName) ||
      !normalizeRequiredString(lastName) ||
      age === undefined ||
      !normalizeRequiredString(gender) ||
      !normalizeRequiredString(country) ||
      !normalizeRequiredString(city)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 128 characters",
      });
    }

    const parsedAge = Number(age);

    if (
      typeof age === "boolean" ||
      (typeof age === "string" && age.trim() === "") ||
      !Number.isInteger(parsedAge) ||
      parsedAge < 13 ||
      parsedAge > 120
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid age",
      });
    }

    if (
      profilePicture !== undefined &&
      typeof profilePicture !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Profile picture must be a string",
      });
    }

    if (bio !== undefined && typeof bio !== "string") {
      return res.status(400).json({
        success: false,
        message: "Bio must be a string",
      });
    }

    if (
      hobbies !== undefined &&
      (!Array.isArray(hobbies) ||
        hobbies.length > 20 ||
        hobbies.some(
          (hobby) =>
            typeof hobby !== "string" ||
            hobby.trim().length > 50
        ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid hobbies array",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { username: normalizedUsername },
        { email: normalizedEmail },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          existingUser.email === normalizedEmail
            ? "Email is already registered"
            : "Username is already taken",
      });
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      firstName,
      lastName,
      age: parsedAge,
      gender,
      country,
      city,
      profilePicture,
      bio,
      hobbies,
    });

    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    const safeUser = await User.findById(user._id).select(
      publicUserFields
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: safeUser,
    });
  } catch (error) {
    // MongoDB unique indexes are the final authority on uniqueness.
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];

      return res.status(409).json({
        success: false,
        message:
          field === "email"
            ? "Email is already registered"
            : "Username is already taken",
      });
    }

    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const email = normalizeRequiredString(req.body.email).toLowerCase();
    const { password } = req.body;

    if (
      !email ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email and password",
      });
    }

    const user = await User.findOne({ email })
      .select("+password +refreshTokenHash");

    if (
      !user ||
      !(await user.comparePassword(password))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive",
      });
    }

    const accessToken = createAccessToken(user._id);
    const refreshToken = createRefreshToken(user._id);

    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    const safeUser = await User.findById(user._id).select(
      publicUserFields
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      clearAuthCookies(res);

      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    let payload;

    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearAuthCookies(res);

      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    const user = await User.findById(payload.sub).select(
      "+refreshTokenHash"
    );

    if (
      !user ||
      !user.isActive ||
      !user.refreshTokenHash ||
      hashToken(token) !== user.refreshTokenHash
    ) {
      clearAuthCookies(res);

      return res.status(401).json({
        success: false,
        message: "Refresh token is no longer valid",
      });
    }

    const newAccessToken = createAccessToken(user._id);
    const newRefreshToken = createRefreshToken(user._id);

    user.refreshTokenHash = hashToken(newRefreshToken);
    await user.save();

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      try {
        const payload = verifyRefreshToken(token);

        await User.findByIdAndUpdate(payload.sub, {
          $unset: { refreshTokenHash: 1 },
        });
      } catch {
        // Even an expired token should not prevent cookie clearing.
      }
    }

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      publicUserFields
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

export { register, login, refresh, logout, getMe };
