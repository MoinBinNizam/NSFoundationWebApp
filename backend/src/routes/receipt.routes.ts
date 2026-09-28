import { Router } from 'express';
import multer from 'multer';
import { ReceiptController } from '../controllers/receipt.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';
import { createError } from '../middlewares/error.js';

const router = Router();

// Configure multer memory storage with file validation
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file limit
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(createError('Invalid file type. Allowed: JPEG, PNG, WEBP, and PDF.', 400));
    }
  },
});

// All receipt endpoints require authentication and staff access
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT));

// Upload endpoint (accepts single 'file' or multiple 'receipts')
router.post(
  '/',
  upload.fields([
    { name: 'receipts', maxCount: 10 },
    { name: 'file', maxCount: 1 },
  ]),
  (req, _res, next) => {
    // Flatten files to req.files array for controller
    const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined;
    const combined: Express.Multer.File[] = [];
    if (filesMap?.receipts) combined.push(...filesMap.receipts);
    if (filesMap?.file) combined.push(...filesMap.file);
    req.files = combined;
    next();
  },
  ReceiptController.upload
);

// List receipts & queue
router.get('/', ReceiptController.list);

// Single receipt details and protected file streaming
router.get('/:id', ReceiptController.getById);
router.get('/:id/file', ReceiptController.streamFile);

// Review & Allocation Preview
router.patch('/:id/review', ReceiptController.review);
router.post('/:id/preview', ReceiptController.previewAllocation);

// Duplicate override & Final Posting
router.post('/:id/duplicate-override', ReceiptController.overrideDuplicate);
router.post('/:id/post', ReceiptController.postPayment);

export default router;
