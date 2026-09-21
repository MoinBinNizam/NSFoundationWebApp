import { NextFunction, Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { createError } from '../middlewares/error.js';
import { ExpenseService } from '../services/expense.service.js';

export class ExpenseController {
  static async getStats(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ExpenseService.getExpenseStats({ startDate: req.query.startDate ? String(req.query.startDate) : undefined, endDate: req.query.endDate ? String(req.query.endDate) : undefined, category: req.query.category ? String(req.query.category) : undefined, custodyAccountId: req.query.custodyAccountId ? String(req.query.custodyAccountId) : undefined }) }); } catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try { const result = await ExpenseService.getExpenses({ page: req.query.page ? Number(req.query.page) : undefined, limit: req.query.limit ? Number(req.query.limit) : undefined, search: req.query.search ? String(req.query.search) : undefined, category: req.query.category ? String(req.query.category) : undefined, custodyAccountId: req.query.custodyAccountId ? String(req.query.custodyAccountId) : undefined, startDate: req.query.startDate ? String(req.query.startDate) : undefined, endDate: req.query.endDate ? String(req.query.endDate) : undefined }); res.json({ success: true, data: result.expenses, pagination: result.pagination }); } catch (error) { next(error); }
  }
  static async getById(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ExpenseService.getExpenseById(req.params.id) }); } catch (error) { next(error); }
  }
  static async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { custodyAccountId, amount, category, date, description, receiptUrl, notes } = req.body;
      if (!custodyAccountId || amount === undefined || !category || !description) return next(createError('custodyAccountId, amount, category, and description are required', 400));
      if (!req.user) return next(createError('Authentication required', 401));
      const result = await ExpenseService.createExpense({ custodyAccountId, amount: Number(amount), category, date, description, receiptUrl, notes }, req.user);
      res.status(201).json({ success: true, message: `Expense ${result.expense.expenseNumber} recorded successfully`, data: result });
    } catch (error) { next(error); }
  }
}
