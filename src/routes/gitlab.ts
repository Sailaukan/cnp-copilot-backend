import express from 'express';
import { connectToGitLab, disconnectFromGitLab, getRepositoryFiles, getRepositoryFileContent } from '../controllers/gitlabController';

const router = express.Router();

router.post('/connect', connectToGitLab);

router.post('/disconnect', disconnectFromGitLab);

router.get('/files', getRepositoryFiles);

router.get('/files/:filePath(*)', getRepositoryFileContent);

export default router; 