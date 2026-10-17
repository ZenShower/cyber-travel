import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
export const skillsRoot = path.resolve(process.env.TRAVEL_SKILLS_DIR || 'skills');
export const generatedImagesRoot = path.resolve(process.env.TRAVEL_IMAGES_DIR || path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'generated_images'));
