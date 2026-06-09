import https from "https";
import { NextRequest, NextResponse } from "next/server";

function callGroqAPI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const buf = Buffer.from(body, "utf-8");
    const apiKey = (process.env.GROQ_API_KEY ?? "").trim();

    const req = https.request(
      {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": buf.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          try {
            const data = Buffer.concat(chunks).toString("utf-8");
            const json = JSON.parse(data);
            resolve(json.choices[0].message.content ?? "");
          } catch (e) {
            reject(e);
          }
        });
      },
    );

    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  console.log("[ai-quiz] raw body:", rawBody);

  let body: {
    content?: string;
    count: number;
    type: "multiple" | "short" | "mixed";
    difficulty: "easy" | "normal" | "hard";
  };
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("[ai-quiz] JSON.parse failed:", e);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { content, count, type, difficulty } = body;
  console.log("[ai-quiz] parsed values:", { content: content?.slice(0, 100), count, type, difficulty });

  const prompt = `
You are a quiz generator. Create ${count} quiz questions about: ${content}
Type: ${type === "multiple" ? "multiple choice (4 options)" : "short answer"}
Difficulty: ${difficulty}
Respond in Korean. Return JSON only with this format:
{
  "questions": [
    {
      "type": "multiple",
      "question": "문제 텍스트",
      "options": ["보기1 전체 텍스트", "보기2 전체 텍스트", "보기3 전체 텍스트", "보기4 전체 텍스트"],
      "answer": "정답 보기의 전체 텍스트 (options 배열의 값 중 하나와 정확히 일치해야 함)",
      "explanation": "해설"
    }
  ]
}
IMPORTANT: The "answer" field must contain the full text of the correct option, copied exactly from the "options" array. Do NOT use numbers like ①②③④ in the answer field.`;

  const text = await callGroqAPI(prompt);
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  if (!match) {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "JSON parse failed" }, { status: 500 });
  }
}
