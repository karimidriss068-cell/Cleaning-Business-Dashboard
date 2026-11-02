import type { SceneInput } from "@/lib/board/scene/script";

// Sample data for /board/preview. Invented for the demo: no real session, no model call.
export const MOCK_SCENE: SceneInput = {
  question: "Should I hire a part-time commission-only closer for residential leads, or put the same money into Google ads?",
  advisors: ["cash_ruin", "offers_pricing", "operations", "marketing", "contrarian"],
  rounds: 2,
  opening: {
    cash_ruin: "Stance: Hire the closer, but only on commission. Biggest risk: paying for ads while leads wait. I'd cap the trial at four weeks and $0 fixed cost.",
    offers_pricing: "Stance: Fix the offer before adding people. Biggest risk: a closer selling a vague price. I'd write one recurring plan and a price list first.",
    operations: "Stance: Yes, if calls are recorded and scripted. Biggest risk: a new seller promising what the crews can't deliver. I'd write the handoff checklist.",
    marketing: "Stance: Ads first, closer second. Biggest risk: more leads than hours to answer them. I'd test one channel for two weeks.",
    contrarian: "Stance: Neither. Biggest risk: growth is capped by repeat rate, not leads. I'd check how many clients rebook before spending.",
  },
  replies: {
    cash_ruin: "Fair point on rebooking. I still want the trial capped, and I'll add: check retention first, it's free.",
    contrarian: "A commission-only closer is cheap enough that I'll accept it, if retention is measured in the same month.",
    operations: "Agreed on retention. I'd also keep discovery calls with the owner so the script gets better.",
  },
  votes: { cash_ruin: "conditional", offers_pricing: "conditional", operations: "for", marketing: "against", contrarian: "against" },
  verdict: {
    verdict: "Go, with conditions: start a capped, commission-only closer trial, but only after you've recorded your own calls and checked how many clients rebook.",
    dissent: ["Marketing would put the money into ads first and add the closer later.", "Contrarian is unconvinced that leads, not repeat rate, are the limit."],
    actions: [
      { title: "Record 10 of your own sales calls", why: "You need a script before anyone else sells." },
      { title: "Write the one-page offer and price list", why: "A closer needs something clear to sell." },
      { title: "Count clients who rebooked in the last 60 days", why: "It settles the ads versus closer question for free." },
    ],
  },
};
