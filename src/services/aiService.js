/**
 * AI Service - Groq Integration for Enhanced Feedback
 *
 * This service provides AI-powered feedback enhancement for fitness form analysis.
 * It uses Groq's Chat Completions API to generate personalized coaching suggestions
 * based on exercise data, pose analysis, and existing feedback.
 *
 * Groq offers ultra-fast inference with free tier:
 * - 30 requests/minute
 * - 14,400 requests/day (for llama-3.1-8b-instant)
 * - Perfect for real-time feedback generation
 *
 * Environment Variables Required:
 * - GROQ_API_KEY: Your Groq API key (get from https://console.groq.com/)
 *
 * Optional:
 * - GROQ_MODEL: Model to use (default: 'llama-3.1-8b-instant')
 * - GROQ_TEMPERATURE: Temperature for generation (default: 0.7)
 * - GROQ_MAX_TOKENS: Maximum tokens in response (default: 500)
 *
 * Installation:
 * npm install groq-sdk
 */

import Groq from "groq-sdk";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { FEEDBACK_TYPES, FEEDBACK_SEVERITY } from "../config/constants.js";

// Initialize Groq client
let groqClient = null;

/**
 * Check if Groq is properly configured
 * @returns {boolean} True if configuration is valid
 */
export const isConfigured = () => {
  return !!process.env.GROQ_API_KEY;
};

/**
 * Get or create Groq client instance
 * @returns {Groq|null} Groq client instance or null if not configured
 */
const getClient = () => {
  if (!isConfigured()) {
    return null;
  }

  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  return groqClient;
};

/**
 * Default configuration for Groq requests
 * Using llama-3.1-8b-instant for best speed/quality balance
 */
const DEFAULT_CONFIG = {
  model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.7,
  maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 100, // Reduced for simpler, shorter feedback
};

/**
 * Available Groq models for feedback generation
 */
export const GROQ_MODELS = {
  // Fastest, best for real-time feedback
  LLAMA_3_1_8B_INSTANT: "llama-3.1-8b-instant",
  // More capable, slightly slower
  LLAMA_3_1_70B_VERSATILE: "llama-3.1-70b-versatile",
  // Alternative fast model
  LLAMA_3_8B_INSTANT: "llama-3-8b-8192",
  // Most capable, slower
  LLAMA_3_70B_VERSATILE: "llama-3-70b-8192",
};

/**
 * Build system prompt for fitness coaching
 * @returns {string} System prompt
 */
const buildSystemPrompt = () => {
  return `You are a friendly fitness coach helping people improve their exercise form. Your feedback must be SIMPLE and EASY TO UNDERSTAND for everyone, even beginners.

CRITICAL RULES:
- Use simple, everyday language - NO technical jargon or complex terms
- Write like you're talking to a friend, not a medical professional
- Keep it short: 1-2 sentences maximum
- Use simple words: "bend" instead of "flex", "straight" instead of "extend", "keep" instead of "maintain"
- Be direct: "Your knees are bending too much" not "Excessive knee flexion detected"
- Give one clear action: "Keep your back straight" not multiple complex instructions
- Use "you" and "your" to make it personal and clear
- Avoid abbreviations, acronyms, or scientific terms

Examples of GOOD feedback:
- "Your back is bending too much. Try to keep it straight like a board."
- "Your knees are going too far forward. Keep them behind your toes."
- "Great job! You're keeping your back straight."

Examples of BAD feedback (too complex):
- "Excessive lumbar flexion detected. Maintain spinal alignment."
- "Knee angle exceeds optimal range. Adjust joint positioning."
- "Biomechanical inefficiency in hip extension."

Remember: If a 10-year-old can't understand it, it's too complex!`;
};

/**
 * Build user prompt for enhancing feedback
 * @param {Object} feedback - Feedback object to enhance
 * @param {Object} exercise - Exercise information
 * @param {Object} session - Session information
 * @returns {string} User prompt
 */
const buildFeedbackPrompt = (feedback, exercise, session) => {
  const { type, severity, message, keypoints, timestamp, metadata } = feedback;

  let prompt = `I need help enhancing feedback for a fitness exercise session.\n\n`;

  // Exercise context
  if (exercise) {
    prompt += `Exercise: ${exercise.name}\n`;
    if (exercise.category) prompt += `Category: ${exercise.category}\n`;
    if (exercise.description)
      prompt += `Description: ${exercise.description}\n`;
    if (exercise.targetMuscles?.length > 0) {
      prompt += `Target Muscles: ${exercise.targetMuscles.join(", ")}\n`;
    }
    if (exercise.instructions?.length > 0) {
      prompt += `Instructions: ${exercise.instructions.join("; ")}\n`;
    }
    prompt += `\n`;
  }

  // Session context
  if (session) {
    prompt += `Session Duration: ${session.duration} seconds\n`;
    if (session.overallScore !== undefined) {
      prompt += `Overall Score: ${session.overallScore}/100\n`;
    }
    prompt += `\n`;
  }

  // Feedback details
  prompt += `Current Feedback:\n`;
  prompt += `- Type: ${type}\n`;
  prompt += `- Severity: ${severity}\n`;
  prompt += `- Message: ${message}\n`;

  if (keypoints?.length > 0) {
    prompt += `- Affected Keypoints: ${keypoints.join(", ")}\n`;
  }

  if (timestamp > 0) {
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    prompt += `- Time: ${minutes}:${seconds.toString().padStart(2, "0")}\n`;
  }

  if (metadata) {
    if (metadata.angleValue !== undefined) {
      prompt += `- Angle Value: ${metadata.angleValue}°\n`;
    }
    if (metadata.threshold !== undefined) {
      prompt += `- Threshold: ${metadata.threshold}°\n`;
    }
  }

  prompt += `\n`;

  // Request based on feedback type - SIMPLIFIED
  if (type === FEEDBACK_TYPES.FORM_ERROR) {
    prompt += `This is a form error. Write ONE simple sentence that:\n`;
    prompt += `- Says what's wrong in plain language\n`;
    prompt += `- Tells them what to do to fix it\n`;
    prompt += `- Uses simple words anyone can understand\n`;
    prompt += `Example: "Your back is bending too much. Try to keep it straight like a board."\n`;
  } else if (type === FEEDBACK_TYPES.IMPROVEMENT) {
    prompt += `This is a suggestion for improvement. Write ONE simple sentence that:\n`;
    prompt += `- Says what could be better in plain language\n`;
    prompt += `- Tells them how to improve it\n`;
    prompt += `- Uses encouraging, friendly words\n`;
    prompt += `Example: "Try to keep your knees behind your toes when you squat down."\n`;
  } else if (type === FEEDBACK_TYPES.ENCOURAGEMENT) {
    prompt += `This is positive feedback. Write ONE simple, encouraging sentence that:\n`;
    prompt += `- Says what they're doing well\n`;
    prompt += `- Uses friendly, positive words\n`;
    prompt += `Example: "Great job! You're keeping your back straight."\n`;
  }

  prompt += `\nIMPORTANT: Write ONLY ONE simple sentence. Use everyday words. Make it easy to understand. NO technical terms.`;

  return prompt;
};

/**
 * Enhance a single feedback item with AI-generated suggestions
 * @param {Object} feedback - Feedback object to enhance
 * @param {Object} options - Enhancement options
 * @param {Object} options.exercise - Exercise information (optional)
 * @param {Object} options.session - Session information (optional)
 * @param {string} options.model - Groq model to use (optional)
 * @returns {Promise<Object>} Enhanced feedback with AI suggestion
 */
export const enhanceFeedback = async (feedback, options = {}) => {
  // Convert feedback to plain object if it's a Mongoose document
  const feedbackObj = feedback.toObject ? feedback.toObject() : { ...feedback };

  if (!isConfigured()) {
    logWarn("Groq not configured, skipping AI enhancement");
    return {
      ...feedbackObj,
      suggestion: feedbackObj.suggestion || null,
      aiGenerated: false,
    };
  }

  const client = getClient();
  if (!client) {
    throw new Error("Groq client not available");
  }

  const { exercise, session, model } = options;
  const selectedModel = model || DEFAULT_CONFIG.model;

  try {
    logInfo("Enhancing feedback with Groq AI", {
      feedbackId: feedbackObj._id?.toString(),
      type: feedbackObj.type,
      severity: feedbackObj.severity,
      message: feedbackObj.message?.substring(0, 50),
      model: selectedModel,
    });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildFeedbackPrompt(feedbackObj, exercise, session);

    const chatCompletion = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: DEFAULT_CONFIG.temperature,
      max_tokens: 100, // Keep it short and simple - one sentence only
    });

    const aiSuggestion = chatCompletion.choices[0]?.message?.content?.trim();

    if (!aiSuggestion) {
      logWarn("Groq returned empty suggestion", {
        feedbackId: feedbackObj._id?.toString(),
      });
      return {
        ...feedbackObj,
        suggestion: feedbackObj.suggestion || null,
        aiGenerated: false,
      };
    }

    logInfo("Groq AI feedback enhancement successful", {
      feedbackId: feedbackObj._id?.toString(),
      tokensUsed: chatCompletion.usage?.total_tokens,
      model: selectedModel,
    });

    return {
      ...feedbackObj,
      suggestion: aiSuggestion,
      aiGenerated: true,
    };
  } catch (error) {
    logError("Failed to enhance feedback with Groq AI", error);

    // Handle rate limit errors specifically
    if (error.status === 429) {
      logWarn("Groq rate limit exceeded, returning original feedback", {
        feedbackId: feedbackObj._id?.toString(),
      });
    }

    // Return original feedback without AI enhancement on error
    return {
      ...feedbackObj,
      suggestion: feedbackObj.suggestion || null,
      aiGenerated: false,
      aiError: error.message,
    };
  }
};

/**
 * Enhance multiple feedback items with AI-generated suggestions
 * @param {Array<Object>} feedbackArray - Array of feedback objects to enhance
 * @param {Object} options - Enhancement options
 * @param {Object} options.exercise - Exercise information (optional)
 * @param {Object} options.session - Session information (optional)
 * @param {boolean} options.parallel - Process in parallel (default: false, to avoid rate limits)
 * @param {string} options.model - Groq model to use (optional)
 * @returns {Promise<Array<Object>>} Array of enhanced feedback items
 */
export const enhanceFeedbackBatch = async (feedbackArray, options = {}) => {
  // Convert all feedback items to plain objects first
  const plainFeedbackArray = feedbackArray.map((fb) =>
    fb.toObject ? fb.toObject() : { ...fb }
  );

  if (!isConfigured()) {
    logWarn("Groq not configured, skipping AI enhancement");
    return plainFeedbackArray.map((feedback) => ({
      ...feedback,
      suggestion: feedback.suggestion || null,
      aiGenerated: false,
    }));
  }

  logInfo("Starting batch feedback enhancement with Groq AI", {
    feedbackCount: plainFeedbackArray.length,
    parallel: options.parallel || false,
  });

  const { parallel = false, model } = options;

  if (parallel) {
    // Process all feedback items in parallel (faster but may hit rate limits)
    const promises = plainFeedbackArray.map((feedback) =>
      enhanceFeedback(feedback, options)
    );
    return Promise.all(promises);
  } else {
    // Process sequentially to avoid rate limits (Groq: 30 req/min)
    const enhancedFeedback = [];
    for (let i = 0; i < plainFeedbackArray.length; i++) {
      const feedback = plainFeedbackArray[i];
      logInfo(`Enhancing feedback ${i + 1}/${plainFeedbackArray.length}`, {
        feedbackId: feedback._id?.toString(),
        type: feedback.type,
      });

      const enhanced = await enhanceFeedback(feedback, { ...options, model });
      enhancedFeedback.push(enhanced);

      // Small delay between requests to avoid rate limits (30 req/min = 1 req per 2 seconds)
      if (plainFeedbackArray.length > 1 && i < plainFeedbackArray.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2100)); // 2.1 seconds between requests
      }
    }

    logInfo("Batch feedback enhancement completed", {
      totalProcessed: enhancedFeedback.length,
      aiEnhancedCount: enhancedFeedback.filter((fb) => fb.aiGenerated).length,
    });

    return enhancedFeedback;
  }
};

/**
 * Generate a summary of feedback for a session
 * @param {Array<Object>} feedbackArray - Array of feedback objects
 * @param {Object} options - Summary options
 * @param {Object} options.exercise - Exercise information (optional)
 * @param {Object} options.session - Session information (optional)
 * @param {string} options.model - Groq model to use (optional)
 * @returns {Promise<string>} AI-generated summary
 */
export const generateFeedbackSummary = async (feedbackArray, options = {}) => {
  if (!isConfigured()) {
    logWarn("Groq not configured, skipping AI summary generation");
    return null;
  }

  if (!feedbackArray || feedbackArray.length === 0) {
    return null;
  }

  const client = getClient();
  if (!client) {
    throw new Error("Groq client not available");
  }

  const { exercise, session, model } = options;
  const selectedModel = model || DEFAULT_CONFIG.model;

  try {
    logInfo("Generating Groq AI feedback summary", {
      feedbackCount: feedbackArray.length,
      model: selectedModel,
    });

    const systemPrompt = `You are an expert fitness coach. Generate a concise, encouraging summary 
of exercise feedback that highlights key areas for improvement and celebrates progress. 
Keep it to 3-4 sentences maximum.`;

    let userPrompt = `Generate a summary of feedback for an exercise session.\n\n`;

    if (exercise) {
      userPrompt += `Exercise: ${exercise.name}\n`;
    }

    if (session) {
      userPrompt += `Session Duration: ${session.duration} seconds\n`;
      if (session.overallScore !== undefined) {
        userPrompt += `Overall Score: ${session.overallScore}/100\n`;
      }
    }

    userPrompt += `\nFeedback Items:\n`;
    feedbackArray.forEach((feedback, index) => {
      userPrompt += `${index + 1}. [${feedback.type}] ${feedback.message}`;
      if (feedback.suggestion) {
        userPrompt += ` - ${feedback.suggestion}`;
      }
      userPrompt += `\n`;
    });

    userPrompt += `\nProvide a brief, encouraging summary that highlights the main areas for improvement.`;

    const chatCompletion = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: DEFAULT_CONFIG.temperature,
      max_tokens: 300,
    });

    const summary = chatCompletion.choices[0]?.message?.content?.trim();

    logInfo("Groq AI feedback summary generated", {
      tokensUsed: chatCompletion.usage?.total_tokens,
      model: selectedModel,
    });

    return summary;
  } catch (error) {
    logError("Failed to generate feedback summary with Groq", error);
    return null;
  }
};

/**
 * Generate personalized coaching tips based on exercise and session data
 * @param {Object} options - Coaching options
 * @param {Object} options.exercise - Exercise information
 * @param {Object} options.session - Session information
 * @param {Array<Object>} options.feedback - Array of feedback items
 * @param {string} options.model - Groq model to use (optional)
 * @returns {Promise<string>} AI-generated coaching tips
 */
export const generateCoachingTips = async (options = {}) => {
  if (!isConfigured()) {
    logWarn("Groq not configured, skipping AI coaching tips generation");
    return null;
  }

  const client = getClient();
  if (!client) {
    throw new Error("Groq client not available");
  }

  const { exercise, session, feedback = [], model } = options;
  const selectedModel = model || DEFAULT_CONFIG.model;

  try {
    logInfo("Generating Groq AI coaching tips", {
      model: selectedModel,
    });

    const systemPrompt = `You are an expert fitness coach. Provide 3-5 practical, actionable 
coaching tips that help users improve their exercise form. Each tip should be specific, 
actionable, and easy to understand. Format as a numbered list.`;

    let userPrompt = `Generate coaching tips for an exercise session.\n\n`;

    if (exercise) {
      userPrompt += `Exercise: ${exercise.name}\n`;
      if (exercise.description)
        userPrompt += `Description: ${exercise.description}\n`;
      if (exercise.targetMuscles?.length > 0) {
        userPrompt += `Target Muscles: ${exercise.targetMuscles.join(", ")}\n`;
      }
    }

    if (session) {
      userPrompt += `Session Duration: ${session.duration} seconds\n`;
      if (session.overallScore !== undefined) {
        userPrompt += `Overall Score: ${session.overallScore}/100\n`;
      }
    }

    if (feedback.length > 0) {
      userPrompt += `\nCommon Issues Identified:\n`;
      feedback.slice(0, 5).forEach((fb, index) => {
        userPrompt += `${index + 1}. ${fb.message}\n`;
      });
    }

    userPrompt += `\nProvide 3-5 practical coaching tips to help improve form.`;

    const chatCompletion = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: DEFAULT_CONFIG.temperature,
      max_tokens: 400,
    });

    const tips = chatCompletion.choices[0]?.message?.content?.trim();

    logInfo("Groq AI coaching tips generated", {
      tokensUsed: chatCompletion.usage?.total_tokens,
      model: selectedModel,
    });

    return tips;
  } catch (error) {
    logError("Failed to generate coaching tips with Groq", error);
    return null;
  }
};

// Default export
export default {
  isConfigured,
  enhanceFeedback,
  enhanceFeedbackBatch,
  generateFeedbackSummary,
  generateCoachingTips,
  GROQ_MODELS,
};
