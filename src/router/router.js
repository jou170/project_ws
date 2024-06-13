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

// const storageSingle = multer.diskStorage({
//   destination: (req, file, callback) => {
//     // kalau req.body tidak terbaca, pastikan field dengan tipe file, berada dipaling bawah
//     const foldername = `uploads/${req.body.user.username}`;

//     if (!fs.existsSync(foldername)) {
//       fs.mkdirSync(foldername, { recursive: true });
//     }

//     callback(null, foldername);
//   },
//   filename: (req, file, callback) => {
//     console.log(file);
//     const fileExtension = path.extname(file.originalname).toLowerCase();
//     callback(null, `profile_picture${fileExtension}`);
//   },
// });
// const uploadSingle = multer({
//   storage: storageSingle,
//   limits: {
//     fileSize: 20000, // dalam byte, jadi 1000 byte = 1kb, 1000000 byte = 1mb
//   },
//   fileFilter: (req, file, callback) => {
//     const filetypes = /jpeg|jpg|png/;
//     const fileExtension = path.extname(file.originalname).toLowerCase();

//     const checkExtName = filetypes.test(fileExtension);
//     const checkMimeType = filetypes.test(file.mimetype);

//     if (checkExtName && checkMimeType) {
//       callback(null, true);
//     } else {
//       callback(new Error("tipe data salah"), false);
//     }
//   },
// });

router.put(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfilePicture
);
// router.post("/forgot-password", forgotPassword)
// router.post("/reset-password", resetPassword)
// router.get("/users", validateAccessToken, getUsers)
// router.get("/user/:id", validateAccessToken, getUserById)
// router.put("/user/:id", validateAccessToken, updateUser)
// router.delete("/user/:id", validateAccessToken, deleteUser)

module.exports = router;
