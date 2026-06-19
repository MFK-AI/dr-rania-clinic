import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { logTelegramAlert } from "../db";

function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can configure Telegram alerts." });
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export const telegramRouter = router({
  sendAlert: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        alertType: z.enum(["instant", "daily_summary"]).default("instant"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram bot is not configured. Please add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in settings.",
        });
      }

      const success = await sendTelegramMessage(botToken, chatId, input.message);
      await logTelegramAlert(input.alertType, input.message, success);

      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send Telegram message. Please check your bot configuration.",
        });
      }

      return { success: true };
    }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    requireDoctor(ctx.user.role);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return { configured: false, message: "Telegram credentials not set." };
    }

    const success = await sendTelegramMessage(
      botToken,
      chatId,
      "✅ <b>Dr. Rania Clinic</b> — Telegram connection test successful!"
    );

    return { configured: true, connected: success };
  }),
});

// Exported helper for use in periodic jobs
export async function sendTelegramAlert(message: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;
  return sendTelegramMessage(botToken, chatId, message);
}
