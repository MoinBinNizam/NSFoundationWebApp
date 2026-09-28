import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { ReceiptService } from '../services/ocr/receipt.service.js';
import { ReceiptStatus, ReceiptGateway } from '../types/receipt.js';
import { createError } from '../middlewares/error.js';

export class ReceiptController {
  /**
   * POST /api/payments/receipts
   * Accepts single or batch file uploads via multipart/form-data.
   */
  static async upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const singleFile = req.file as Express.Multer.File | undefined;

      const uploadList: Express.Multer.File[] = [];
      if (files && Array.isArray(files)) {
        uploadList.push(...files);
      } else if (singleFile) {
        uploadList.push(singleFile);
      }

      if (uploadList.length === 0) {
        return next(createError('No receipt image or PDF file uploaded.', 400));
      }

      const uploadedBy = (req.user as any)._id;
      const batchId = req.body?.batchId || (uploadList.length > 1 ? `batch_${Date.now()}` : undefined);

      const results = [];
      for (const file of uploadList) {
        const receipt = await ReceiptService.uploadReceipt(
          file.buffer,
          file.originalname,
          file.mimetype,
          uploadedBy,
          batchId
        );
        results.push(receipt);
      }

      res.status(201).json({
        success: true,
        message: `${results.length} receipt(s) uploaded and processed.`,
        data: results.length === 1 ? results[0] : results,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/receipts
   */
  static async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, gateway, limit, skip } = req.query;
      const result = await ReceiptService.listReceipts({
        status: status as ReceiptStatus,
        gateway: gateway as ReceiptGateway,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        skip: skip ? parseInt(String(skip), 10) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.receipts,
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/receipts/:id
   */
  static async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const receipt = await ReceiptService.getReceiptById(id);
      if (!receipt) {
        return next(createError(`Receipt not found: ${id}`, 404));
      }

      res.status(200).json({
        success: true,
        data: receipt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/receipts/:id/file
   */
  static async streamFile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { stream, fullPath } = await ReceiptService.getReceiptFileStream(id);

      // Determine content-type from extension
      if (fullPath.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      } else if (fullPath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      res.setHeader('Content-Disposition', 'inline');
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/payments/receipts/:id/review
   */
  static async review(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const receipt = await ReceiptService.reviewReceipt(id, req.body, req.user as any);

      res.status(200).json({
        success: true,
        message: 'Receipt review data updated',
        data: receipt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/receipts/:id/preview
   */
  static async previewAllocation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const preview = await ReceiptService.calculateReceiptAllocationPreview(id);

      res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/receipts/:id/duplicate-override
   */
  static async overrideDuplicate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const receipt = await ReceiptService.overrideDuplicate(id, reason, req.user as any);

      res.status(200).json({
        success: true,
        message: 'Duplicate warning authorized with override reason',
        data: receipt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/receipts/:id/post
   */
  static async postPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ReceiptService.postPaymentFromReceipt(id, req.user as any);

      res.status(200).json({
        success: true,
        message: 'Payment recorded and posted successfully from OCR receipt',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
