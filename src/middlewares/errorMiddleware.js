import multer from "multer";

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: Object.values(err.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource identifier",
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must not exceed 5 MB"
          : "Invalid file upload",
    });
  }

  if (err.message === "Only JPEG, PNG, and WebP images are allowed") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err.message === "Only JPEG, PNG, WebP, MP4, and WebM files are allowed") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 500
  ) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

export default errorMiddleware;
