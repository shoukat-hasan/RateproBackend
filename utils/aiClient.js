// utils/aiClient.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Complete a prompt using Gemini (Google AI).
 * @param {Object} options
 * @param {string} options.prompt - Prompt text for the model
 * @param {number} [options.maxTokens=500] - Max tokens in completion
 * @returns {Promise<{ text: string }>}
 */
exports.complete = async ({ prompt, maxTokens = 500 }) => {
  try {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt must be a non-empty string");
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    // Recommended way to extract text
    const text = result.response.text();

    return { text };
  } catch (err) {
    console.error("Gemini Client Error:", err);
    throw new Error("Gemini AI service failed. Please try again later.");
  }
};

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
