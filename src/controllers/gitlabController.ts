import { Request, Response } from 'express';
import axios from 'axios';

interface GitLabConnectRequest {
    repoUrl: string;
    accessToken: string;
}

let currentConnection: GitLabConnectRequest | null = null;

export const connectToGitLab = async (req: Request, res: Response): Promise<void> => {
    try {
        const { repoUrl, accessToken }: GitLabConnectRequest = req.body;

        // Basic validation
        if (!repoUrl || !accessToken) {
            res.status(400).json({
                error: 'Missing required fields',
                message: 'Both repoUrl and accessToken are required'
            });
            return;
        }

        // Validate repository URL format (basic check)
        if (!repoUrl.trim() || !isValidGitLabUrl(repoUrl)) {
            res.status(400).json({
                error: 'Invalid repository URL',
                message: 'Please provide a valid GitLab repository URL'
            });
            return;
        }

        // Validate access token (basic check)
        if (!accessToken.trim() || accessToken.length < 10) {
            res.status(400).json({
                error: 'Invalid access token',
                message: 'Please provide a valid GitLab access token'
            });
            return;
        }

        currentConnection = {
            repoUrl: repoUrl.trim(),
            accessToken: accessToken.trim()
        };

        console.log('📡 GitLab connection received:');
        console.log(`   Repository: ${currentConnection.repoUrl}`);
        console.log(`   Token: ${currentConnection.accessToken.substring(0, 8)}...`);

        try {
            const response = await axios.get(currentConnection.repoUrl, {
                headers: {
                    'PRIVATE-TOKEN': currentConnection.accessToken
                }
            });
            console.log('🔍 GitLab API test successful:', response.data);
        } catch (apiError) {
            console.warn('⚠️ GitLab API test failed, but connection stored:', apiError);
        }

        // Return success response
        res.status(200).json({
            success: true,
            message: 'GitLab connection details received successfully',
            data: {
                repoUrl: currentConnection.repoUrl,
                connected: true,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in connectToGitLab:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process GitLab connection'
        });
    }
};


export const disconnectFromGitLab = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!currentConnection) {
            res.status(400).json({
                error: 'Not connected',
                message: 'No active GitLab connection found'
            });
            return;
        }

        console.log('🔌 Disconnecting from GitLab repository');


        currentConnection = null;

        res.status(200).json({
            success: true,
            message: 'Disconnected from GitLab successfully',
            data: {
                connected: false,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in disconnectFromGitLab:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to disconnect from GitLab'
        });
    }
};

interface GitLabFile {
    id: string;
    name: string;
    path: string;
    type: 'blob' | 'tree';
    size?: number;
    mode: string;
}

interface GitLabFileContent {
    file_name: string;
    file_path: string;
    size: number;
    encoding: string;
    content_sha256: string;
    ref: string;
    blob_id: string;
    commit_id: string;
    last_commit_id: string;
    content: string;
}

/**
 * Get repository files from GitLab API
 */
export const getRepositoryFiles = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!currentConnection) {
            res.status(400).json({
                error: 'Not connected',
                message: 'Please connect to a GitLab repository first'
            });
            return;
        }

        const { path = '', ref = 'main', recursive = 'false' } = req.query;

        // Extract project ID from repository URL
        const projectId = extractProjectIdFromUrl(currentConnection.repoUrl);
        if (!projectId) {
            res.status(400).json({
                error: 'Invalid repository URL',
                message: 'Could not extract project ID from repository URL'
            });
            return;
        }

        // Get GitLab API base URL from repository URL
        const gitlabApiUrl = getGitLabApiUrl(currentConnection.repoUrl);

        // Construct API endpoint for repository tree
        const apiUrl = `${gitlabApiUrl}/projects/${encodeURIComponent(projectId)}/repository/tree`;

        const params = new URLSearchParams({
            ref: ref as string,
            recursive: recursive as string,
            per_page: '100'
        });

        if (path && typeof path === 'string' && path.trim()) {
            params.append('path', path);
        }

        console.log(`🔍 Fetching GitLab repository files from: ${apiUrl}?${params.toString()}`);

        const response = await axios.get(`${apiUrl}?${params.toString()}`, {
            headers: {
                'PRIVATE-TOKEN': currentConnection.accessToken,
                'Accept': 'application/json'
            },
            timeout: 10000 // 10 second timeout
        });

        const gitlabFiles: GitLabFile[] = response.data;

        // Transform GitLab files to our format
        const transformedFiles = gitlabFiles.map(file => ({
            id: file.id,
            name: file.name,
            path: file.path,
            type: file.type === 'blob' ? 'file' as const : 'folder' as const,
            size: file.size,
            mode: file.mode
        }));

        console.log(`✅ Successfully fetched ${transformedFiles.length} files from GitLab`);

        res.status(200).json({
            success: true,
            message: `Successfully fetched ${transformedFiles.length} files`,
            data: {
                repoUrl: currentConnection.repoUrl,
                projectId,
                ref: ref as string,
                path: path as string || '/',
                files: transformedFiles,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in getRepositoryFiles:', error);

        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message = error.response?.data?.message || error.message;

            if (status === 401) {
                res.status(401).json({
                    error: 'Authentication failed',
                    message: 'Invalid access token or insufficient permissions'
                });
                return;
            } else if (status === 404) {
                res.status(404).json({
                    error: 'Repository not found',
                    message: 'Repository or branch not found'
                });
                return;
            } else if (status === 403) {
                res.status(403).json({
                    error: 'Access denied',
                    message: 'Insufficient permissions to access this repository'
                });
                return;
            }

            res.status(status || 500).json({
                error: 'GitLab API error',
                message: `GitLab API request failed: ${message}`
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to fetch repository files'
            });
        }
    }
};

/**
 * Get raw file content from GitLab repository
 */
export const getRepositoryFileContent = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!currentConnection) {
            res.status(400).json({
                error: 'Not connected',
                message: 'Please connect to a GitLab repository first'
            });
            return;
        }

        const { filePath } = req.params;
        const { ref = 'main', lfs = 'false' } = req.query;

        if (!filePath) {
            res.status(400).json({
                error: 'Missing file path',
                message: 'File path parameter is required'
            });
            return;
        }

        // Extract project ID from repository URL
        const projectId = extractProjectIdFromUrl(currentConnection.repoUrl);
        if (!projectId) {
            res.status(400).json({
                error: 'Invalid repository URL',
                message: 'Could not extract project ID from repository URL'
            });
            return;
        }

        // Get GitLab API base URL from repository URL
        const gitlabApiUrl = getGitLabApiUrl(currentConnection.repoUrl);

        // Construct API endpoint for raw file content
        const encodedFilePath = encodeURIComponent(filePath);
        const apiUrl = `${gitlabApiUrl}/projects/${encodeURIComponent(projectId)}/repository/files/${encodedFilePath}/raw`;

        const params = new URLSearchParams({
            ref: ref as string
        });

        if (lfs === 'true') {
            params.append('lfs', 'true');
        }

        console.log(`📄 Fetching file content from: ${apiUrl}?${params.toString()}`);

        const response = await axios.get(`${apiUrl}?${params.toString()}`, {
            headers: {
                'PRIVATE-TOKEN': currentConnection.accessToken
            },
            timeout: 15000 // 15 second timeout for file content
        });

        console.log(`✅ Successfully fetched content for file: ${filePath}`);

        res.status(200).json({
            success: true,
            message: 'File content retrieved successfully',
            data: {
                filePath,
                ref: ref as string,
                content: response.data,
                size: response.data.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in getRepositoryFileContent:', error);

        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message = error.response?.data?.message || error.message;

            if (status === 401) {
                res.status(401).json({
                    error: 'Authentication failed',
                    message: 'Invalid access token or insufficient permissions'
                });
                return;
            } else if (status === 404) {
                res.status(404).json({
                    error: 'File not found',
                    message: 'File not found in repository or branch'
                });
                return;
            }

            res.status(status || 500).json({
                error: 'GitLab API error',
                message: `Failed to fetch file content: ${message}`
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to fetch file content'
            });
        }
    }
};

/**
 * Extract project ID from GitLab repository URL
 * Supports both gitlab.com and self-hosted GitLab instances
 */
function extractProjectIdFromUrl(repoUrl: string): string | null {
    try {
        const url = new URL(repoUrl);

        // Remove leading slash and .git suffix if present
        let pathname = url.pathname.replace(/^\//, '').replace(/\.git$/, '');

        // For GitLab, the project ID is typically the full path (namespace/project)
        // or it could be a numeric ID
        if (pathname) {
            return pathname;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Get GitLab API base URL from repository URL
 */
function getGitLabApiUrl(repoUrl: string): string {
    try {
        const url = new URL(repoUrl);
        return `${url.protocol}//${url.host}/api/v4`;
    } catch {
        // Fallback to gitlab.com
        return 'https://gitlab.com/api/v4';
    }
}

/**
 * Basic GitLab URL validation
 */
function isValidGitLabUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        // Check if it's a GitLab URL (gitlab.com or self-hosted GitLab)
        return urlObj.protocol === 'https:' &&
            (urlObj.hostname.includes('gitlab') || url.includes('gitlab'));
    } catch {
        return false;
    }
} 