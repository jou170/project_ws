const router = require("express").Router();
const {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  editUserProfilePicture,
} = require("../controllers/UserController.js");

const {
  getCompanies,
  getCompaniesByUsername,
  getTopUpRequest,
  editTopUpRequest,
} = require("../controllers/AdminController.js");

const {
  getEmployees,
  getEmployeesByUsername,
  removeEmployeesFromCompany,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
  companyTopUp,
} = require("../controllers/CompanyController.js");

const {
  validateAccessToken,
  allowRoles,
} = require("../middleware/AuthMiddleware.js");
const uploadSingle = require("../middleware/MulterMiddleware.js");

const {
  joinCompany,
  getEmployeeCompany,
} = require("../controllers/EmployeeController.js");

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
  allowRoles(["admin", "company"]),
  getTopUpRequest
);
router.put(
  "/topup/:topup_id",
  validateAccessToken,
  allowRoles(["admin"]),
  editTopUpRequest
);

// Company

router.get(
  "/employees",
  validateAccessToken,
  allowRoles(["company"]),
  getEmployees
);
router.get(
  "/employees/:username",
  validateAccessToken,
  allowRoles(["company"]),
  getEmployeesByUsername
);
router.delete(
  "/employees/:username",
  validateAccessToken,
  allowRoles(["company"]),
  removeEmployeesFromCompany
);
router.post(
  "/topup",
  validateAccessToken,
  allowRoles(["company"]),
  companyTopUp
);
router.post(
  "/upgrade",
  validateAccessToken,
  allowRoles(["company"]),
  upgradeCompanyPlanType
);
router.post(
  "/invitation_code",
  validateAccessToken,
  allowRoles(["company"]),
  generateCompanyInvitationCode
);

// employee
router.post(
  "/company",
  validateAccessToken,
  allowRoles(["employee"]),
  joinCompany
);

router.get(
  "/company",
  validateAccessToken,
  allowRoles(["employee"]),
  getEmployeeCompany
);

module.exports = router;
