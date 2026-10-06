import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stocksRouter from "./stocks";
import dashRouter from "./dash";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stocksRouter);
router.use(dashRouter);

export default router;
