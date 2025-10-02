// utils/aiClient.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const aiClient = {
  /**
   * Complete a prompt using Gemini (Google AI).
   * @param {Object} options
   * @param {string} options.prompt - Prompt text for the model
   * @param {number} [options.maxTokens=500] - Max tokens in completion
   * @returns {Promise<{ text: string }>}
   */
  async complete(input) {
    try {
      console.log("🔍 aiClient.complete called with input type:", typeof input);
      console.log("🔍 Input value preview:", String(input).substring(0, 100));

      // ✅ SIMPLIFIED: Direct string handling
      let prompt = input;

      // Handle object input (if any)
      if (typeof input === "object" && input !== null) {
        if (input.prompt) {
          prompt = input.prompt;
        } else if (input.text) {
          prompt = input.text;
        } else {
          prompt = JSON.stringify(input);
        }
      }

      // Convert to string if not already
      prompt = String(prompt || "").trim();

      console.log("🔍 Final prompt type:", typeof prompt);
      console.log("🔍 Final prompt length:", prompt.length);
      console.log("🔍 Final prompt empty check:", prompt.length === 0);

      // ✅ FIXED: Better validation
      if (!prompt || prompt.length === 0) {
        console.error("❌ Prompt validation failed:", {
          originalInput: typeof input,
          processedPrompt: prompt,
          promptLength: prompt ? prompt.length : "undefined",
        });
        throw new Error("Prompt must be a non-empty string");
      }

      console.log("✅ Prompt validation passed, sending to Gemini...");
      console.log("🤖 Prompt length:", prompt.length);
      console.log("🤖 Prompt preview:", prompt.substring(0, 200) + "...");

      // Check if API key is configured
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured in environment variables");
      }

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      console.log("✅ Gemini response received, length:", text.length);
      console.log("✅ Gemini response preview:", text.substring(0, 300) + "...");

      return {
        text: text,
        usage: {
          prompt_tokens: Math.ceil(prompt.length / 4),
          completion_tokens: Math.ceil(text.length / 4),
        },
      };
    } catch (error) {
      console.error("❌ Gemini Client Error Details:", {
        message: error.message,
        stack: error.stack,
        inputType: typeof input,
        inputLength: input ? String(input).length : "undefined",
      });

      // Check specific error types
      if (error.message.includes("API key") || error.message.includes("GEMINI_API_KEY")) {
        throw new Error("Gemini API key is invalid or missing. Please check your environment variables.");
      }

      if (error.message.includes("rate limit") || error.message.includes("quota")) {
        throw new Error("Gemini API rate limit exceeded. Please try again later.");
      }

      if (error.message.includes("Prompt must be")) {
        throw new Error("Invalid prompt format provided to Gemini API.");
      }

      // Generic error
      throw new Error("Gemini AI service failed. Please try again later.");
    }
  },
};

module.exports = aiClient;

// // utils/aiClient.js
// const OpenAI = require("openai");

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// /**
//  * Complete a prompt using OpenAI (or other LLM provider).
//  * @param {Object} options
//  * @param {string} options.prompt - Prompt text for the model
//  * @param {number} [options.maxTokens=500] - Max tokens in completion
//  * @returns {Promise<{ text: string }>}
//  */
// exports.complete = async ({ prompt, maxTokens = 500 }) => {
//   try {
//     const response = await openai.completions.create({
//       model: "text-davinci-003", // Or gpt-4 if upgraded
//       prompt,
//       max_tokens: maxTokens,
//       temperature: 0.7,
//     });

//     const text = response.choices?.[0]?.text?.trim() || "";
//     return { text };
//   } catch (err) {
//     console.error("AI Client Error:", err);
//     throw new Error("AI service failed. Please try again later.");
//   }
// };
