import { Readable } from "node:stream";
import cloudinary from "../../config/cloudinary.js";

export const uploadProfileImage = (buffer, userId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "ami-mini-social-app/profiles",
        public_id: userId.toString(),
        overwrite: true,
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
          { width: 600, height: 600, crop: "fill", gravity: "face" },
          { quality: "auto", fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );

    Readable.from(buffer).pipe(stream);
  });

export const uploadPostMedia = (buffer, userId, mimetype) =>
  new Promise((resolve, reject) => {
    const isVideo = mimetype.startsWith("video/");

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `ami-mini-social-app/posts/${userId}`,
        resource_type: isVideo ? "video" : "image",
        allowed_formats: isVideo
          ? ["mp4", "webm"]
          : ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          width: result.width ?? null,
          height: result.height ?? null,
          duration: result.duration ?? null,
        });
      },
    );

    Readable.from(buffer).pipe(stream);
  });

export const deleteCloudinaryMedia = async (media) => {
  return cloudinary.uploader.destroy(media.publicId, {
    resource_type: media.resourceType,
    invalidate: true,
  });
};
