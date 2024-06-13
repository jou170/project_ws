const router = require("express").Router();
const {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  editUserProfilePicture,
} = require("../controllers/UserController.js");
const {
  validateAccessToken,
  allowRoles,
} = require("../middleware/AuthMiddleware.js");
const uploadSingle = require("../middleware/MulterMiddleware.js");

// General
router.post("/login", login);
router.post("/register", register);
router.get(
  "/profile",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  viewUserProfile
);
router.put(
  "/profile/data",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfileData
);
router.put(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfilePicture
);

// Admin

router.get(
  "/companies",
  validateAccessToken,
  allowRoles(["admin"]),
  getCompanies
);
router.get(
  "/companies/:username",
  validateAccessToken,
  allowRoles(["admin"]),
  getCompaniesByUsername
);
router.get(
  "/topup",
  validateAccessToken,
  allowRoles(["admin"]),
  getTopUpRequest
);
// router.post("/forgot-password", forgotPassword)
// router.post("/reset-password", resetPassword)
// router.get("/users", validateAccessToken, getUsers)
// router.get("/user/:id", validateAccessToken, getUserById)
// router.put("/user/:id", validateAccessToken, updateUser)
// router.delete("/user/:id", validateAccessToken, deleteUser)
module.exports = router;
