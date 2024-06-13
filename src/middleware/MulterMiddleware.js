const multer = require("multer");
const fs = require("fs");
const path = require("path");
const storageSingle = multer.diskStorage({
  destination: (req, file, callback) => {
    // kalau req.body tidak terbaca, pastikan field dengan tipe file, berada dipaling bawah
    const foldername = `uploads/${req.body.user.username}`;

    if (!fs.existsSync(foldername)) {
      fs.mkdirSync(foldername, { recursive: true });
    }

    callback(null, foldername);
  },
  filename: (req, file, callback) => {
    console.log(file);
    // ambil file extensionnya
    const fileExtension = path.extname(file.originalname).toLowerCase();
    callback(null, `profile_picture${fileExtension}`); //profile_picture.jpg
  },
});

const uploadSingle = multer({
  storage: storageSingle,
  limits: {
    fileSize: 20000, // dalam byte, jadi 1000 byte = 1kb, 1000000 byte = 1mb
  },
  fileFilter: (req, file, callback) => {
    // file type yang diperbolehkan, dalam bentuk regex
    const filetypes = /jpeg|jpg|png|gif/;
    const fileExtension = path.extname(file.originalname).toLowerCase();

    const checkExtName = filetypes.test(fileExtension);
    const checkMimeType = filetypes.test(file.mimetype);

    if (checkExtName && checkMimeType) {
      callback(null, true);
    } else {
      callback(new Error("tipe data salah"), false);
    }
  },
});
module.exports = { uploadSingle };
