import { Request, Response, NextFunction } from 'express';
import { InvestmentService } from '../services/investment.service.js';
import { IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export class InvestmentController {
  /**
   * GET /api/investments/stats
   */
  static async getStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await InvestmentService.getInvestmentStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/investments/projects
   */
  static async listProjects(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, category, externalEntity, search } = req.query;

      const projects = await InvestmentService.getProjects({
        status: status ? String(status) : undefined,
        category: category ? String(category) : undefined,
        externalEntity: externalEntity ? String(externalEntity) : undefined,
        search: search ? String(search) : undefined,
      });

      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/investments/projects/:id
   */
  static async getProjectDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const details = await InvestmentService.getProjectById(id);

      res.status(200).json({
        success: true,
        data: details,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/investments/projects
   */
  static async createProject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        projectId,
        name,
        description,
        category,
        externalEntity,
        startDate,
        maturityDate,
        expectedROI,
        targetPrincipal,
        initialFundings,
      } = req.body;

      if (!name || !startDate || targetPrincipal === undefined) {
        return next(createError('name, startDate, and targetPrincipal are required', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const project = await InvestmentService.createProject(
        {
          projectId,
          name,
          description,
          category,
          externalEntity,
          startDate,
          maturityDate,
          expectedROI,
          targetPrincipal: Number(targetPrincipal),
          initialFundings,
        },
        req.user
      );

      res.status(201).json({
        success: true,
        message: `Investment project '${name}' created successfully`,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/investments/projects/:id/fund
   * Multi-accountant funding into a project
   */
  static async fundProject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { fundings, date } = req.body;

      if (!fundings || !Array.isArray(fundings) || fundings.length === 0) {
        return next(createError('fundings array is required with at least one funding entry', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const result = await InvestmentService.fundProject(
        {
          projectId: id,
          fundings,
          date,
        },
        req.user
      );

      res.status(200).json({
        success: true,
        message: `Successfully funded ৳${result.totalNewFunding.toLocaleString()} into ${result.project.name}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/investments/projects/:id/returns
   * Record project maturity return
   */
  static async recordReturn(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        maturityDate,
        principalReturned,
        actualProfit,
        actualLoss,
        destinationType,
        destinationCustodyAccountId,
        notes,
      } = req.body;

      if (!destinationType) {
        return next(createError('destinationType is required (ACCOUNTANT_CUSTODY or EXTERNAL_WALLET)', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const result = await InvestmentService.recordProjectReturn(
        {
          projectId: id,
          maturityDate,
          principalReturned: Number(principalReturned) || 0,
          actualProfit: Number(actualProfit) || 0,
          actualLoss: Number(actualLoss) || 0,
          destinationType,
          destinationCustodyAccountId,
          notes,
        },
        req.user
      );

      res.status(200).json({
        success: true,
        message: `Recorded return of ৳${result.totalReturn.toLocaleString()} for ${result.project.name}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/investments/reinvest
   * Reinvest wallet proceeds into a new project with optional new accountant funds
   */
  static async reinvest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        sourceProjectId,
        destinationProjectId,
        walletAccountId,
        reinvestedAmount,
        newAccountantFunds,
        newAccountantCustodyAccountId,
        date,
        notes,
      } = req.body;

      if (!sourceProjectId || !destinationProjectId || !walletAccountId || !reinvestedAmount) {
        return next(
          createError(
            'sourceProjectId, destinationProjectId, walletAccountId, and reinvestedAmount are required',
            400
          )
        );
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const result = await InvestmentService.reinvestProjectFunds(
        {
          sourceProjectId,
          destinationProjectId,
          walletAccountId,
          reinvestedAmount: Number(reinvestedAmount),
          newAccountantFunds: Number(newAccountantFunds) || 0,
          newAccountantCustodyAccountId,
          date,
          notes,
        },
        req.user
      );

      res.status(200).json({
        success: true,
        message: `Successfully reinvested ৳${result.totalInvestedInDest.toLocaleString()} into ${result.destProject.name}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/investments/projects/:id/status
   */
  static async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        return next(createError('status is required', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const project = await InvestmentService.updateProjectStatus(id, status, notes || '', req.user);

      res.status(200).json({
        success: true,
        message: `Project status updated to ${status}`,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }
}
