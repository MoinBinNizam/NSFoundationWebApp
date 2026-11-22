import { Request, Response, NextFunction } from 'express';
import {
  getGoverningBodyMembers,
  addGoverningBodyMember,
  updateGoverningBodyMember,
  deleteGoverningBodyMember,
} from '../services/governing-body.service.js';

export async function getGoverningBodyHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await getGoverningBodyMembers();
    res.json({
      success: true,
      data: list,
      count: list.length,
    });
  } catch (err) {
    next(err);
  }
}

export async function addGoverningBodyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actingUser = (req as any).user;
    const meta = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
    const created = await addGoverningBodyMember(req.body, actingUser, meta);
    res.status(201).json({
      success: true,
      data: created,
      message: 'Executive board member added successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGoverningBodyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const actingUser = (req as any).user;
    const meta = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
    const updated = await updateGoverningBodyMember(id, req.body, actingUser, meta);
    res.json({
      success: true,
      data: updated,
      message: 'Executive role details updated successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteGoverningBodyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const actingUser = (req as any).user;
    const meta = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
    const result = await deleteGoverningBodyMember(id, actingUser, meta);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}
