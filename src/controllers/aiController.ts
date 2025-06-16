import { Request, Response } from 'express';
import aiService, { ChatRequest, CodebaseFile } from '../services/aiService';
import fs from 'fs';
import path from 'path';

export const chatWithAI = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, currentContent, filePath, action, selectedFiles }: ChatRequest = req.body;

        // Validate required fields
        if (!message || !action) {
            res.status(400).json({
                error: 'Missing required fields: message and action are required'
            });
            return;
        }

        // Validate action type
        if (!['edit', 'generate', 'chat', 'analyze_codebase', 'process_with_files'].includes(action)) {
            res.status(400).json({
                error: 'Invalid action. Must be one of: edit, generate, chat, analyze_codebase, process_with_files'
            });
            return;
        }

        let requestData: ChatRequest = {
            message,
            currentContent,
            filePath,
            action,
            selectedFiles
        };

        // If action is analyze_codebase, fetch codebase files first
        if (action === 'analyze_codebase') {
            try {
                const codebaseFiles = await fetchCodebaseFiles();
                requestData.codebaseFiles = codebaseFiles;
            } catch (error) {
                console.error('Error fetching codebase files:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch codebase files',
                    details: 'Please ensure the codebase folder exists and contains files'
                });
                return;
            }
        }

        // Process the request with AI service
        const result = await aiService.processDocumentRequest(requestData);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('AI Controller Error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        res.status(500).json({
            success: false,
            error: 'Failed to process AI request',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        });
    }
};

async function fetchCodebaseFiles(): Promise<CodebaseFile[]> {
    try {
        // Path to the codebase folder relative to the backend
        const codebasePath = path.join(__dirname, '../../../docs/codebase');

        if (!fs.existsSync(codebasePath)) {
            throw new Error('Codebase folder not found');
        }

        const files = await scanDirectory(codebasePath, codebasePath);

        // Filter to include only relevant file types for documentation
        const relevantExtensions = [
            '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
            '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
            '.json', '.yaml', '.yml', '.toml', '.xml', '.md', '.txt',
            '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.env'
        ];

        const relevantFiles = files.filter(file => {
            const ext = path.extname(file.path).toLowerCase();
            return file.type === 'file' && (
                relevantExtensions.includes(ext) ||
                file.name.toLowerCase().includes('readme') ||
                file.name.toLowerCase().includes('config') ||
                file.name.toLowerCase().includes('package') ||
                file.name.toLowerCase().includes('makefile') ||
                !ext // Files without extension (like Dockerfile)
            );
        });

        console.log(`📁 Found ${relevantFiles.length} relevant files in codebase`);
        return relevantFiles;

    } catch (error) {
        console.error('Error in fetchCodebaseFiles:', error);
        throw new Error('Could not fetch codebase files from local folder');
    }
}

async function scanDirectory(dirPath: string, basePath: string): Promise<CodebaseFile[]> {
    const files: CodebaseFile[] = [];

    try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const relativePath = path.relative(basePath, fullPath);

            // Skip hidden files, node_modules, and other common ignore patterns
            if (shouldIgnoreFile(item, relativePath)) {
                continue;
            }

            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                files.push({
                    path: relativePath,
                    name: item,
                    type: 'folder'
                });

                // Recursively scan subdirectories
                const subFiles = await scanDirectory(fullPath, basePath);
                files.push(...subFiles);
            } else {
                files.push({
                    path: relativePath,
                    name: item,
                    type: 'file',
                    size: stats.size
                });
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
}

function shouldIgnoreFile(fileName: string, relativePath: string): boolean {
    const ignorePatterns = [
        // Hidden files and directories
        /^\./,
        // Dependencies
        /node_modules/,
        /vendor/,
        /venv/,
        /__pycache__/,
        // Build outputs
        /dist/,
        /build/,
        /out/,
        /target/,
        // IDE files
        /\.vscode/,
        /\.idea/,
        // OS files
        /\.DS_Store/,
        /Thumbs\.db/,
        // Logs
        /\.log$/,
        // Large files that are typically not useful for documentation
        /package-lock\.json$/,
        /yarn\.lock$/,
        /composer\.lock$/,
        // Binary files
        /\.(exe|dll|so|dylib|bin|img|iso)$/i,
        // Media files
        /\.(jpg|jpeg|png|gif|bmp|svg|ico|mp4|mp3|wav|avi)$/i
    ];

    return ignorePatterns.some(pattern => pattern.test(fileName) || pattern.test(relativePath));
} 