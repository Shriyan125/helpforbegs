import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import helper from '@/utils'; // Should be skipped as path alias!

const app = express();
app.get('/', (req: Request, res: Response) => {
  res.send('TS OK');
});
