// GitLab related types
export interface GitLabConnection {
    repoUrl: string;
    accessToken: string;
    connected: boolean;
    timestamp: string;
}

export interface GitLabFile {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'folder';
    size?: number;
    lastModified?: string;
}

// API Response types
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

export interface ErrorResponse {
    error: string;
    message: string;
} 