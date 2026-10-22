
import User from "../models/User.js";
import { uploadProfileImage } from "../services/mediaService.js";
import cloudinary from "../../config/cloudinary.js";

const publicProfileFields =
  "username firstName lastName age gender country city profilePicture bio hobbies followers following createdAt";

const editableFields = [
  "username",
  "firstName",
  "lastName",
  "age",
  "gender",
  "country",
  "city",
  "bio",
  "hobbies",
];

export const getPublicProfile = async (req, res, next) => {
  try {
    const username = req.params.username.toLowerCase();

    const user = await User.findOne({
      username,
      isActive: true,
    }).select(publicProfileFields);

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

export const updateProfile = async (req, res, next) => {
  try {
    const updates = {};

    for (const field of editableFields) {
      if (Object.hasOwn(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid profile fields provided",
      });
    }

    if (
      updates.username !== undefined &&
      (typeof updates.username !== "string" ||
        !/^[a-zA-Z0-9_]{3,30}$/.test(updates.username.trim()))
    ) {
      return res.status(400).json({
        success: false,
        message: "Username must be 3–30 letters, numbers, or underscores",
      });
    }

    if (
      updates.bio !== undefined &&
      (typeof updates.bio !== "string" || updates.bio.length > 300)
    ) {
      return res.status(400).json({
        success: false,
        message: "Bio must be a string of up to 300 characters",
      });
    }

    if (updates.age !== undefined) {
      const age = updates.age;

      if (
        typeof age === "boolean" ||
        (typeof age === "string" && age.trim() === "") ||
        !Number.isInteger(Number(age)) ||
        Number(age) < 13 ||
        Number(age) > 120
      ) {
        return res.status(400).json({
          success: false,
          message: "Age must be a whole number between 13 and 120",
        });
      }

      updates.age = Number(age);
    }

    if (updates.hobbies !== undefined) {
      if (
        !Array.isArray(updates.hobbies) ||
        updates.hobbies.length > 20 ||
        updates.hobbies.some(
          (hobby) =>
            typeof hobby !== "string" ||
            hobby.trim().length === 0 ||
            hobby.trim().length > 50
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Provide up to 20 valid hobbies",
        });
      }

      updates.hobbies = updates.hobbies.map((hobby) => hobby.trim());
    }

    for (const field of ["firstName", "lastName", "country", "city"]) {
      if (updates[field] !== undefined) {
        if (
          typeof updates[field] !== "string" ||
          !updates[field].trim() ||
          updates[field].trim().length > 100
        ) {
          return res.status(400).json({
            success: false,
            message: `${field} is invalid`,
          });
        }

        updates[field] = updates[field].trim();
      }
    }

    if (updates.gender !== undefined) {
      const allowedGenders = [
        "male",
        "female",
        "non-binary",
        "prefer-not-to-say",
        "other",
      ];

      if (
        typeof updates.gender !== "string" ||
        !allowedGenders.includes(updates.gender.trim().toLowerCase())
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid gender",
        });
      }

      updates.gender = updates.gender.trim().toLowerCase();
    }

    if (updates.username !== undefined) {
      updates.username = updates.username.trim().toLowerCase();
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).select(publicProfileFields);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That username is already taken",
      });
    }

    next(error);
  }
};

export const updateProfilePicture = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile picture",
      });
    }

    const result = await uploadProfileImage(
      req.file.buffer,
      req.user._id
    );

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profilePicture: result.secure_url } },
      { new: true, runValidators: true }
    ).select(publicProfileFields);

    if (!user) {
      await cloudinary.uploader.destroy(result.public_id);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: user.profilePicture,
      user,
    });
  } catch (error) {
    next(error);
  }
};
