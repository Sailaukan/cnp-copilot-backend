import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

require('dotenv').config()

export interface ChatRequest {
    message: string;
    currentContent?: string;
    filePath?: string;
    action: 'edit' | 'generate' | 'chat' | 'analyze_codebase' | 'process_with_files';
    selectedFiles?: string[];
    codebaseFiles?: CodebaseFile[];
}

export interface CodebaseFile {
    path: string;
    name: string;
    type: 'file' | 'folder';
    size?: number;
}

export interface FileAnalysis {
    relevantFiles: string[];
    reasoning: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface ChatResponse {
    response: string;
    suggestedContent?: string;
    action: string;
    fileAnalysis?: FileAnalysis;
    needsUserConfirmation?: boolean;
}

class AIService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured in environment variables');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async processDocumentRequest(request: ChatRequest): Promise<ChatResponse> {
        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            let prompt = '';

            switch (request.action) {
                case 'analyze_codebase':
                    return await this.analyzeCodebaseForTask(request);
                case 'process_with_files':
                    return await this.processWithSelectedFiles(request);
                case 'edit':
                    prompt = this.buildEditPrompt(request);
                    break;
                case 'generate':
                    prompt = this.buildGeneratePrompt(request);
                    break;
                case 'chat':
                    prompt = this.buildChatPrompt(request);
                    break;
                default:
                    throw new Error('Invalid action type');
            }

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            // Parse response to extract suggested content if applicable
            const parsedResponse = this.parseAIResponse(text, request.action);

            return {
                response: parsedResponse.explanation,
                suggestedContent: parsedResponse.content,
                action: request.action
            };

        } catch (error) {
            console.error('AI Service Error:', error);
            throw new Error('Failed to process AI request');
        }
    }

    private async analyzeCodebaseForTask(request: ChatRequest): Promise<ChatResponse> {
        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const filesList = request.codebaseFiles?.map(file =>
                `${file.path} (${file.type}${file.size ? `, ${file.size} bytes` : ''})`
            ).join('\n') || '';

            const prompt = `You are an expert technical documentation analyst. I need to create comprehensive technical documentation and I want you to analyze which files from the codebase would be most relevant for the following documentation task:

DOCUMENTATION TASK: ${request.message}

CURRENT DOCUMENT: ${request.filePath || 'Unknown'}

AVAILABLE CODEBASE FILES:
${filesList}

Please analyze the task and determine which files would be most relevant to create accurate and comprehensive technical documentation. Consider:

1. **Core Application Files**: Main entry points, core logic, and primary functionality
2. **Configuration Files**: Setup, environment, and configuration files (package.json, config files, etc.)
3. **Component/Module Files**: Key components, services, utilities, and modules
4. **API/Interface Files**: Routes, controllers, API definitions, and interfaces
5. **Documentation Files**: Existing README files, comments, and documentation
6. **Build/Deployment Files**: Build scripts, deployment configurations, and setup files
7. **Test Files**: Unit tests, integration tests that show expected behavior and usage

Focus on files that will help create documentation that explains:
- What the application/system does
- How to set it up and use it
- Architecture and key components
- API endpoints and interfaces
- Configuration options
- Examples and usage patterns

Respond in this exact format:

REASONING:
[Explain your analysis of the codebase and why these specific files are most relevant for creating comprehensive technical documentation]

RELEVANT_FILES:
[List the file paths, one per line, in order of importance for documentation]

CONFIDENCE:
[high/medium/low - based on how certain you are about the file selection for documentation purposes]`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            const fileAnalysis = this.parseFileAnalysis(response);

            return {
                response: `I've analyzed your codebase and identified ${fileAnalysis.relevantFiles.length} files that would be most helpful for creating comprehensive technical documentation. Please review my suggestions below.`,
                action: 'analyze_codebase',
                fileAnalysis,
                needsUserConfirmation: true
            };

        } catch (error) {
            console.error('Codebase Analysis Error:', error);
            throw new Error('Failed to analyze codebase');
        }
    }

    private async processWithSelectedFiles(request: ChatRequest): Promise<ChatResponse> {
        try {
            if (!request.selectedFiles || request.selectedFiles.length === 0) {
                throw new Error('No files selected for processing');
            }

            // Fetch content of selected files
            const fileContents = await this.fetchFileContents(request.selectedFiles);

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const prompt = `You are an expert technical documentation writer. I need you to create/update comprehensive technical documentation based on the provided codebase files.

DOCUMENTATION TASK: ${request.message}

CURRENT DOCUMENT CONTENT:
\`\`\`markdown
${request.currentContent || ''}
\`\`\`

CURRENT DOCUMENT PATH: ${request.filePath || 'Unknown'}

SELECTED CODEBASE FILES AND THEIR CONTENT:
${fileContents}

Please analyze the code and create comprehensive technical documentation. Focus on:

1. **Project Overview**: What the application/system does, its purpose and main features
2. **Architecture**: High-level architecture, key components, and how they interact
3. **Setup & Installation**: How to set up, install dependencies, and configure the project
4. **Usage**: How to use the application, key features, and common workflows
5. **API Documentation**: If applicable, document API endpoints, parameters, and responses
6. **Configuration**: Available configuration options and environment variables
7. **Code Examples**: Practical examples showing how to use key features
8. **File Structure**: Explanation of important directories and files
9. **Development**: How to contribute, build, test, and deploy

Create documentation that is:
- **Accurate**: Reflects the actual code implementation
- **Complete**: Covers all important aspects shown in the code
- **Clear**: Easy to understand for developers at different skill levels
- **Practical**: Includes real examples from the codebase
- **Well-structured**: Uses proper markdown formatting and logical organization

Format your response as:
EXPLANATION:
[Brief explanation of what documentation you're creating and the key insights from the codebase analysis]

CONTENT:
\`\`\`markdown
[Complete technical documentation in markdown format]
\`\`\``;

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            const parsedResponse = this.parseAIResponse(response, 'edit');

            return {
                response: parsedResponse.explanation,
                suggestedContent: parsedResponse.content,
                action: 'process_with_files'
            };

        } catch (error) {
            console.error('File Processing Error:', error);
            throw new Error('Failed to process selected files');
        }
    }

    private async fetchFileContents(filePaths: string[]): Promise<string> {
        const fileContents: string[] = [];
        const codebasePath = path.join(__dirname, '../../../docs/codebase');

        for (const filePath of filePaths) {
            try {
                const fullPath = path.join(codebasePath, filePath);

                if (!fs.existsSync(fullPath)) {
                    fileContents.push(`
FILE: ${filePath}
[Error: File not found]
`);
                    continue;
                }

                const stats = fs.statSync(fullPath);

                // Skip if it's a directory
                if (stats.isDirectory()) {
                    fileContents.push(`
FILE: ${filePath}
[Directory - skipped]
`);
                    continue;
                }

                // Skip very large files (> 1MB)
                if (stats.size > 1024 * 1024) {
                    fileContents.push(`
FILE: ${filePath}
[File too large (${Math.round(stats.size / 1024)}KB) - skipped]
`);
                    continue;
                }

                const content = fs.readFileSync(fullPath, 'utf-8');
                const fileExtension = path.extname(filePath).toLowerCase();

                // Determine syntax highlighting language
                const language = this.getLanguageFromExtension(fileExtension);

                fileContents.push(`
FILE: ${filePath}
\`\`\`${language}
${content}
\`\`\`
`);

            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
                fileContents.push(`
FILE: ${filePath}
[Error: Could not read file content]
`);
            }
        }

        return fileContents.join('\n');
    }

    private getLanguageFromExtension(ext: string): string {
        const languageMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.go': 'go',
            '.rs': 'rust',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.toml': 'toml',
            '.xml': 'xml',
            '.md': 'markdown',
            '.sql': 'sql',
            '.sh': 'bash',
            '.bat': 'batch',
            '.ps1': 'powershell',
            '.dockerfile': 'dockerfile',
            '.env': 'bash'
        };

        return languageMap[ext] || 'text';
    }

    private parseFileAnalysis(response: string): FileAnalysis {
        const reasoningMatch = response.match(/REASONING:\s*([\s\S]*?)(?=RELEVANT_FILES:|$)/);
        const filesMatch = response.match(/RELEVANT_FILES:\s*([\s\S]*?)(?=CONFIDENCE:|$)/);
        const confidenceMatch = response.match(/CONFIDENCE:\s*(high|medium|low)/i);

        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Analysis completed';
        const filesText = filesMatch ? filesMatch[1].trim() : '';
        const confidence = (confidenceMatch ? confidenceMatch[1].toLowerCase() : 'medium') as 'high' | 'medium' | 'low';

        const relevantFiles = filesText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('[') && !line.startsWith('//'))
            .slice(0, 15);

        return {
            relevantFiles,
            reasoning,
            confidence
        };
    }

    private buildEditPrompt(request: ChatRequest): string {
        return `You are an expert technical documentation editor. The user wants to edit their markdown documentation.

Current document content:
\`\`\`markdown
${request.currentContent || ''}
\`\`\`

File path: ${request.filePath || 'Unknown'}

User request: ${request.message}

Please provide:
1. A brief explanation of what changes you're making
2. The complete updated markdown content

Format your response as:
EXPLANATION:
[Your explanation here]

CONTENT:
\`\`\`markdown
[Updated markdown content here]
\`\`\`

Focus on maintaining proper markdown formatting, improving clarity, and following technical documentation best practices.`;
    }

    private buildGeneratePrompt(request: ChatRequest): string {
        return `You are an expert technical documentation writer. The user wants you to generate new markdown documentation.

${request.filePath ? `File path: ${request.filePath}` : ''}

User request: ${request.message}

Please provide:
1. A brief explanation of what you're creating
2. Complete markdown documentation content

Format your response as:
EXPLANATION:
[Your explanation here]

CONTENT:
\`\`\`markdown
[New markdown content here]
\`\`\`

Create comprehensive, well-structured technical documentation with:
- Clear headings and sections
- Code examples where appropriate
- Proper markdown formatting
- Professional tone suitable for technical documentation`;
    }

    private buildChatPrompt(request: ChatRequest): string {
        return `You are a helpful assistant for technical documentation. The user is working on a markdown document and has a question or needs guidance.

${request.currentContent ? `Current document content:\n\`\`\`markdown\n${request.currentContent}\n\`\`\`` : ''}

${request.filePath ? `File path: ${request.filePath}` : ''}

User question: ${request.message}

Provide helpful guidance, suggestions, or answers related to their documentation. If they're asking for specific changes, explain what you would recommend and why.`;
    }

    private parseAIResponse(text: string, action: string): { explanation: string; content?: string } {
        if (action === 'chat') {
            return { explanation: text };
        }

        const explanationMatch = text.match(/EXPLANATION:\s*([\s\S]*?)(?=CONTENT:|$)/);
        const contentMatch = text.match(/CONTENT:\s*```markdown\s*([\s\S]*?)\s*```/);

        return {
            explanation: explanationMatch ? explanationMatch[1].trim() : text,
            content: contentMatch ? contentMatch[1].trim() : undefined
        };
    }
}

export default new AIService(); 