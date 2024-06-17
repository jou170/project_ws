const router = require("express").Router();

const {
  validateAccessToken,
  allowRoles,
} = require("../middleware/AuthMiddleware.js");

const {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  editUserProfilePicture,
  deleteUserProfilePicture,
  viewUserProfilePicture,
} = require("../controllers/UserController.js");

const {
  getCompanies,
  getCompaniesByUsername,
} = require("../controllers/AdminController.js");

const {
  getTopUpRequest,
  editTopUpRequest,
  companyTopUp,
} = require("../controllers/TopupController.js");

const {
  createSchedule,
  getSchedule,
  deleteSchedule,
} = require("../controllers/ScheduleController.js");

const {
  viewTransaction,
  viewTransactionDetail,
} = require("../controllers/TransactionController.js");

const {
  getEmployees,
  getEmployeesByUsername,
  removeEmployeesFromCompany,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
  viewEmployeePicture,
} = require("../controllers/CompanyController.js");

const {
  joinCompany,
  getEmployeeCompany,
  employeeAttendance,
  getPictureCompany,
} = require("../controllers/EmployeeController.js");

// General
router.post("/login", login);
router.post("/register", register);
router.get(
  "/profile/data",
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

router.get(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  viewUserProfilePicture
);

router.put(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfilePicture
);

router.delete(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  deleteUserProfilePicture
);

router.get(
  "/transactions",
  validateAccessToken,
  allowRoles(["admin", "company"]),
  viewTransaction
);

router.get(
  "/transactions/:transaction_id",
  validateAccessToken,
  allowRoles(["admin", "company"]),
  viewTransactionDetail
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

router.post(
  "/schedule",
  validateAccessToken,
  allowRoles(["company"]),
  createSchedule
);
router.get(
  "/schedule",
  validateAccessToken,
  allowRoles(["company", "employee"]),
  getSchedule
);
router.delete(
  "/schedule",
  validateAccessToken,
  allowRoles(["company"]),
  deleteSchedule
);

router.get(
  "/employees/:username/picture",
  validateAccessToken,
  allowRoles(["admin", "company"]),
  viewEmployeePicture
);

router.get(
  "/employees/:username/data",
  validateAccessToken,
  allowRoles(["admin", "company"]),
  getEmployeesByUsername
);
router.put(
  "/employees/:username",
  validateAccessToken,
  allowRoles(["company"]),
  removeEmployeesFromCompany
);
router.get(
  "/employees",
  validateAccessToken,
  allowRoles(["company"]),
  getEmployees
);
router.post(
  "/topup",
  validateAccessToken,
  allowRoles(["company"]),
  companyTopUp
);
router.put(
  "/upgrade",
  validateAccessToken,
  allowRoles(["company"]),
  upgradeCompanyPlanType
);
router.put(
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
  "/company/data",
  validateAccessToken,
  allowRoles(["employee"]),
  getEmployeeCompany
);
router.get(
  "/company/picture",
  validateAccessToken,
  allowRoles(["employee"]),
  getPictureCompany
);

router.put(
  "/attendance",
  validateAccessToken,
  allowRoles(["employee"]),
  employeeAttendance
);

module.exports = router;
