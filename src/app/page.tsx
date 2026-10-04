"use client";

import { useEffect, useMemo, useState } from "react";

const routine = [
  { time: "07:30", title: "Morning reset", detail: "Water, sunlight, and a calm start", done: true },
  { time: "09:00", title: "Deep work block", detail: "One important thing before the noise", done: true },
  { time: "12:30", title: "Midday check-in", detail: "Notice what your energy needs", done: false, current: true },
  { time: "15:30", title: "Move your body", detail: "A short walk counts", done: false },
  { time: "21:30", title: "Wind down", detail: "Close loops and protect your sleep", done: false },
];

const suggestions = [
  { label: "Energy", value: "Take a 10-minute walk before your next task.", color: "bg-[#d9f0e7]" },
  { label: "Focus", value: "Put your phone in another room for one block.", color: "bg-[#ece5fa]" },
  { label: "Mindset", value: "Write down one thing that went well today.", color: "bg-[#fae7d5]" },
];

type ChatMessage = {
  from: "buddy" | "you";
  text: string;
};

type ScheduleItem = {
  day: string;
  plan: string;
};

type CalendarEvent = {
  id: string;
  day: string;
  time: string;
  title: string;
  source: "upload" | "manual";
  attendance?: "present" | "absent";
};

type BuddyResult = {
  reply: string;
  action: string;
  intent: "none" | "add-event" | "add-event-absence";
  eventTitle?: string;
  attendanceClass?: string;
};

const initialSchedule: ScheduleItem[] = [
  { day: "Mon", plan: "09:00 deep work · 13:00 gym · 18:30 family" },
  { day: "Tue", plan: "10:00 classes · 16:00 errands" },
  { day: "Wed", plan: "09:00 deep work · 19:00 friends" },
  { day: "Thu", plan: "10:00 classes · 17:30 walk" },
  { day: "Fri", plan: "09:00 deep work · 18:00 weekly review" },
  { day: "Sat", plan: "11:00 groceries · open evening" },
  { day: "Sun", plan: "10:00 reset · plan the week" },
];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function extractCalendarEvents(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

  lines.forEach((line, index) => {
    const timeMatch = line.match(timePattern);
    if (!timeMatch) return;
    const dayMatch = line.match(/\b(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i);
    const day = dayMatch ? dayMatch[0].slice(0, 3) : "Mon";
    const time = `${timeMatch[1]}${timeMatch[2] ? `:${timeMatch[2]}` : ":00"}${timeMatch[3] ? ` ${timeMatch[3].toUpperCase()}` : ""}`;
    const title = line
      .replace(timeMatch[0], "")
      .replace(dayMatch?.[0] || "", "")
      .replace(/^[-–—:,\s]+|[-–—:,\s]+$/g, "")
      .trim();
    if (title) {
      events.push({ id: `${Date.now()}-${index}`, day, time, title, source: "upload" });
    }
  });

  return events;
}

function getLocalBuddyReply(
  message: string,
  context: {
    mood: string;
    goal: string;
    schedule: ScheduleItem[];
    calendar: CalendarEvent[];
    recentMessages: ChatMessage[];
    localTime: Date;
  },
): BuddyResult {
  const normalized = message.toLowerCase();
  const currentTime = context.localTime;
  const day = dayNames[currentTime.getDay()];
  const dayName = currentTime.toLocaleDateString([], { weekday: "long" });
  const time = currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const todayPlan = context.schedule[currentTime.getDay() === 0 ? 6 : currentTime.getDay() - 1]?.plan || "";
  const wantsAdd = /\b(add|put|save|schedule|log)\b/.test(normalized) && /\b(calendar|event|schedule)\b/.test(normalized);
  const wantsAbsent = /\b(absent|attendance)\b/.test(normalized);

  if (wantsAdd && wantsAbsent) {
    const eventTitle = normalized.includes("github")
      ? "GitHub event — AI Buddy project"
      : (message.match(/(?:at|attending)\s+(?:this\s+)?(.+?)\s+event/i)?.[1] || "New event")
        .replace(/^this\s+/i, "")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const classEvent = context.calendar.find((event) =>
      event.day.toLowerCase() === day.toLowerCase() && /\b(class|lecture|lab|lesson)\b/i.test(event.title),
    );
    const classInSchedule = todayPlan.match(/(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*)?([\w -]*(?:class|lecture|lab|lesson)[\w -]*)/i)?.[1]?.trim();
    const attendanceClass = classEvent?.title || classInSchedule;

    if (attendanceClass) {
      return {
        reply: `Added “${eventTitle}” to your calendar for ${dayName} at ${time}. I also marked ${attendanceClass} absent.`,
        action: `Calendar updated · ${attendanceClass} marked absent`,
        intent: "add-event-absence",
        eventTitle,
        attendanceClass,
      };
    }

    return {
      reply: `Added “${eventTitle}” to your calendar for ${dayName} at ${time}. I can’t find a class on your timetable for this period—what class should I mark absent?`,
      action: "Tell me the class name and I’ll record the absence.",
      intent: "add-event",
      eventTitle,
    };
  }

  if (wantsAdd) {
    const eventTitle = normalized.includes("github")
      ? "GitHub event — AI Buddy project"
      : (message.match(/(?:add|put|save|schedule|log)\s+(.+?)\s+(?:to|in|on)\s+(?:my\s+)?calendar/i)?.[1] || "New event")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return {
      reply: `Added “${eventTitle}” to your calendar for ${dayName} at ${time}.`,
      action: "Calendar updated.",
      intent: "add-event",
      eventTitle,
    };
  }

  if (/\b(stress|stressed|anxious|overwhelmed|overwhelm)\b/.test(normalized)) {
    return {
      reply: "That sounds like a lot to carry. What’s the one thing making this moment feel hardest?",
      action: "Pause for five slow breaths; we can make a plan after.",
      intent: "none",
    };
  }
  if (/\b(tired|exhausted|sleepy|low energy)\b/.test(normalized)) {
    return {
      reply: `You’re feeling ${context.mood || "low on energy"} at ${time}. Is there room to take a short break before your next commitment?`,
      action: "Drink some water and take five minutes away from your screen.",
      intent: "none",
    };
  }
  if (/\b(focus|distracted|procrastinating)\b/.test(normalized)) {
    return {
      reply: `Let’s make progress toward “${context.goal}” without taking on the whole day. What’s the specific task in front of you?`,
      action: "Set a 10-minute timer and start with the first small step.",
      intent: "none",
    };
  }

  const latestUserMessage = context.recentMessages.filter((item) => item.from === "you").at(-1)?.text;
  if (latestUserMessage && /\b(yes|yeah|no|that|it|because|also|then)\b/.test(normalized)) {
    return {
      reply: `Got it. You mentioned “${latestUserMessage.slice(0, 100)}”—how does that connect to what’s happening now?`,
      action: "Tell me the part you want help with most.",
      intent: "none",
    };
  }

  return {
    reply: `I’m listening. What’s happening right now, and what would you like help with?`,
    action: `Your goal this week: ${context.goal}.`,
    intent: "none",
  };
}


export default function Home() {
  const [now, setNow] = useState<Date | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [mood, setMood] = useState("okay");
  const [goal, setGoal] = useState("build a calmer, healthier routine");
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [uploadStatus, setUploadStatus] = useState("No timetable uploaded");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { from: "buddy", text: "Hey Alex. I know your goal and today’s plan. What’s happening right now?" },
  ]);
  const [liveAction, setLiveAction] = useState("Take 3 slow breaths, then choose the next 10-minute task.");
  const completed = routine.filter((item) => item.done).length;
  const progress = Math.round((completed / routine.length) * 100);
  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = now?.getHours() ?? 12;
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, [now]);

  const localTime = now?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) ?? "your local time";
  const localDate = now?.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) ?? "Today";

  function applyBuddyResult(message: string, result: BuddyResult) {
    if (result.intent === "add-event" || result.intent === "add-event-absence") {
      const currentTime = now ?? new Date();
      const day = dayNames[currentTime.getDay()];
      const time = currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setCalendar((current) => {
        const addedEvent: CalendarEvent = {
          id: `manual-${currentTime.getTime()}`,
          day,
          time,
          title: result.eventTitle || "New event",
          source: "manual",
        };
        if (result.intent !== "add-event-absence" || !result.attendanceClass) {
          return [...current, addedEvent];
        }
        return [
          ...current,
          addedEvent,
          {
            id: `attendance-${currentTime.getTime()}`,
            day,
            time,
            title: result.attendanceClass,
            source: "manual",
            attendance: "absent",
          },
        ];
      });
    }
    setChatMessages((current) => [
      ...current,
      { from: "you", text: message },
      { from: "buddy", text: result.reply },
    ]);
    setLiveAction(result.action);
    setChatInput("");
  }

  function sendMessage(message: string) {
    if (!message) return;
    const currentTime = now ?? new Date();
    const result = getLocalBuddyReply(message, {
      mood,
      goal,
      schedule,
      calendar,
      recentMessages: chatMessages,
      localTime: currentTime,
    });
    applyBuddyResult(message, result);
  }

  function sendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(chatInput.trim());
  }

  function handleQuickPrompt(prompt: string) {
    sendMessage(prompt);
  }

  function updateSchedule(index: number, plan: string) {
    setSchedule((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, plan } : item
    )));
  }

  async function processTimetable(file: File) {
    setUploadStatus(`Reading ${file.name}...`);
    try {
      let text = "";
      if (file.type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist");
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        }
        text = pages.join("\n");
      } else if (file.type.startsWith("image/")) {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        const result = await worker.recognize(file);
        text = result.data.text;
        await worker.terminate();
      } else {
        throw new Error("Upload a PDF or image.");
      }

      const events = extractCalendarEvents(text);
      if (events.length === 0) {
        setUploadStatus("No time + event rows found. Try a clearer timetable.");
        return;
      }
      setCalendar((current) => [...current, ...events]);
      setUploadStatus(`${events.length} event${events.length === 1 ? "" : "s"} added to Buddy's calendar`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not read that timetable.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#15231f]">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-[250px] flex-col border-r border-[#e4e9e3] bg-[#fbfcfa] px-6 py-8 lg:flex">
          <div className="mb-16 flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#193b32] text-lg text-white">+</div>
            <span className="text-lg font-semibold tracking-tight">AI Buddy</span>
          </div>
          <nav className="space-y-2 text-sm">
            <a className="flex items-center gap-3 rounded-xl bg-[#e7f0eb] px-4 py-3 font-semibold text-[#193b32]" href="#">
              <span>◉</span> Today
            </a>
            <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-[#68766f] hover:bg-[#f0f4f0]" href="#routine">
              <span>◷</span> My routine
            </a>
            <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-[#68766f] hover:bg-[#f0f4f0]" href="#insights">
              <span>✦</span> Insights
            </a>
          </nav>
          <div className="mt-auto rounded-2xl bg-[#193b32] p-5 text-white">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#a9c9bc]">Tiny reminder</p>
            <p className="text-sm leading-6 text-[#e6f2ed]">You do not need a perfect day. Just the next good choice.</p>
          </div>
        </aside>

        <section className="w-full px-5 py-6 sm:px-8 lg:px-14 lg:py-10">
          <header className="mb-10 flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm font-medium text-[#799187]">{greeting}, Alex · {localTime}</p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Let&apos;s make today count.</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="hidden rounded-full border border-[#dfe6df] bg-white px-4 py-2.5 text-sm font-medium text-[#617068] sm:block">{localDate}</button>
              <div className="grid size-10 place-items-center rounded-full bg-[#d9e8df] text-sm font-semibold text-[#193b32]">A</div>
            </div>
          </header>

          <section className="mb-7 rounded-[28px] bg-[#193b32] p-6 text-white shadow-[0_20px_50px_-30px_rgba(25,59,50,0.65)] sm:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-medium text-[#b4d5c6]">Your personal check-in</p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">What do you need right now?</h2>
                <p className="mt-1 text-sm text-[#a9cabc]">Buddy uses your mood, goals, and timetable to keep this practical.</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#315c4f] px-2.5 py-1 text-[11px] font-semibold text-[#d4e9df]">
                <span className="size-1.5 rounded-full bg-[#8ed2a8]" /> Local · private
              </span>
            </div>
            <div className="mb-5 max-h-40 space-y-2 overflow-y-auto pr-1">
              {chatMessages.map((message, index) => (
                <div key={`${message.from}-${index}`} className={`flex ${message.from === "you" ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${message.from === "you" ? "bg-[#d4eddf] text-[#193b32]" : "bg-[#315c4f] text-[#e9f5ef]"}`}>
                    {message.text}
                  </p>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Tell Buddy what’s going on..."
                className="min-w-0 flex-1 rounded-full border border-[#507568] bg-[#254b40] px-4 py-3 text-sm text-white outline-none placeholder:text-[#9bbcae] focus:border-[#c3e1d2]"
              />
              <button type="submit" aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d4eddf] text-lg font-semibold text-[#193b32] transition hover:bg-white">↑</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {["I feel stressed", "I need focus", "I’m low on energy"].map((prompt) => (
                <button key={prompt} onClick={() => handleQuickPrompt(prompt)} className="rounded-full border border-[#507568] px-3 py-1.5 text-[11px] font-medium text-[#c5ded1] transition hover:border-[#c3e1d2] hover:text-white">
                  {prompt}
                </button>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-[#d4eddf] p-4 text-[#193b32]">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#57826a]">Do this now · 1 minute</p>
              <p className="text-sm font-semibold leading-5">{liveAction}</p>
            </div>
          </section>

          <div className="grid gap-7 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-7">
              <section id="routine" className="rounded-[28px] border border-[#e4e9e3] bg-white p-7 sm:p-9">
                <div className="mb-7 flex items-end justify-between">
                  <div>
                    <p className="mb-2 text-sm font-medium text-[#799187]">Today&apos;s rhythm</p>
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">Your routine</h2>
                  </div>
                  <span className="text-sm font-medium text-[#799187]">{completed} of {routine.length} done</span>
                </div>
                <div className="mb-8 h-2 overflow-hidden rounded-full bg-[#edf1ed]">
                  <div className="h-full rounded-full bg-[#5eaa85] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="space-y-1">
                  {routine.map((item) => (
                    <div key={item.time} className={`flex items-center gap-4 rounded-2xl px-3 py-3 ${item.current ? "bg-[#f2f7f3]" : ""}`}>
                      <span className="w-12 text-xs font-semibold text-[#91a097]">{item.time}</span>
                      <div className={`grid size-8 shrink-0 place-items-center rounded-full border-2 ${item.done ? "border-[#5eaa85] bg-[#5eaa85] text-white" : item.current ? "border-[#5eaa85] bg-white text-[#5eaa85]" : "border-[#dbe4dd] text-transparent"}`}>✓</div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${item.done ? "text-[#708078] line-through" : ""}`}>{item.title}</p>
                        <p className="truncate text-xs text-[#9aa69f]">{item.detail}</p>
                      </div>
                      {item.current && <span className="hidden rounded-full bg-[#dceee3] px-2.5 py-1 text-[11px] font-semibold text-[#3f8063] sm:block">Now</span>}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div id="insights" className="space-y-7">
              <section className="rounded-[28px] border border-[#e4e9e3] bg-white p-7 sm:p-8">
                <div className="mb-6">
                  <p className="mb-2 text-sm font-medium text-[#799187]">Your context</p>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">Help Buddy know your week</h2>
                </div>
                <label className="mb-4 block text-xs font-bold uppercase tracking-[0.14em] text-[#82948a]">
                  Current state of mind
                  <select value={mood} onChange={(event) => setMood(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dfe7df] bg-[#fbfcfa] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#334a40] outline-none focus:border-[#8fb59c]">
                    <option value="okay">Okay, but a little scattered</option>
                    <option value="calm">Calm and steady</option>
                    <option value="tired">Tired and low-energy</option>
                    <option value="stressed">Stressed and overloaded</option>
                    <option value="hopeful">Hopeful and motivated</option>
                  </select>
                </label>
                <label className="mb-5 block text-xs font-bold uppercase tracking-[0.14em] text-[#82948a]">
                  This week&apos;s goal
                  <input value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dfe7df] bg-[#fbfcfa] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#334a40] outline-none focus:border-[#8fb59c]" />
                </label>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#82948a]">Weekly timetable</p>
                  <label className="mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#b8cbbd] bg-[#f4f8f4] px-3 py-3 text-xs font-semibold text-[#47755d] transition hover:bg-[#edf5ee]">
                    <span>Upload PDF or image</span>
                    <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void processTimetable(file);
                    }} />
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px]">Choose file</span>
                  </label>
                  <p className="mb-3 text-xs text-[#91a097]">{uploadStatus}</p>
                  <div className="space-y-2">
                    {schedule.map((item, index) => (
                      <div key={item.day} className="flex items-center gap-2">
                        <span className="w-8 text-xs font-semibold text-[#799187]">{item.day}</span>
                        <input value={item.plan} onChange={(event) => updateSchedule(index, event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#e8ede8] bg-[#fbfcfa] px-3 py-2 text-xs text-[#52645a] outline-none focus:border-[#8fb59c]" />
                      </div>
                    ))}
                  </div>
                </div>
                {calendar.length > 0 && (
                  <div className="mt-5 rounded-2xl bg-[#f2f7f3] p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6b9275]">Internal calendar · {calendar.length} events</p>
                    <div className="space-y-1.5">
                      {calendar.slice(0, 6).map((event) => (
                        <p key={event.id} className="text-xs text-[#526b5c]">
                          <strong>{event.day} {event.time}</strong> · {event.title}
                          {event.attendance === "absent" && <span className="ml-1.5 rounded-full bg-[#f8e6df] px-1.5 py-0.5 text-[10px] font-semibold text-[#a15d4f]">Absent</span>}
                        </p>
                      ))}
                      {calendar.length > 6 && <p className="text-xs text-[#91a097]">+ {calendar.length - 6} more events</p>}
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs leading-5 text-[#91a097]">Your context stays in this session. Buddy uses it securely via the free Keyless proxy.</p>
              </section>
              <section className="rounded-[28px] border border-[#e4e9e3] bg-white p-7 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="mb-2 text-sm font-medium text-[#799187]">A little nudge</p>
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">Ideas for this moment</h2>
                  </div>
                  <span className="text-xl text-[#e4b45c]">✦</span>
                </div>
                <div className="space-y-3">
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.label} className={`rounded-2xl p-4 ${suggestion.color}`}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[#6e7d75]">{suggestion.label}</p>
                      <p className="text-sm font-medium leading-5 text-[#293c34]">{suggestion.value}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-[28px] border border-[#e4e9e3] bg-[#eef5ef] p-7 sm:p-8">
                <p className="mb-6 text-sm font-medium text-[#799187]">Your week at a glance</p>
                <div className="flex items-end justify-between gap-3">
                  {[42, 68, 54, 78, 63, 35, 18].map((height, index) => (
                    <div key={index} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-28 w-full items-end rounded-full bg-[#e0ece2]">
                        <div className={`w-full rounded-full ${index === 4 ? "bg-[#3f8063]" : "bg-[#9bc5ab]"}`} style={{ height: `${height}%` }} />
                      </div>
                      <span className="text-[11px] font-medium text-[#82948a]">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-sm leading-6 text-[#557166]"><strong className="font-semibold text-[#315b4b]">Nice consistency.</strong> You&apos;ve shown up 4 days in a row.</p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
