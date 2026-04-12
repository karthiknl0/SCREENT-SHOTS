import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_USD_TO_INR = 95;
const CAPTION_MODEL = "gemini-2.5-flash-lite";

// Markup applied on top of actual API cost — customers are charged this multiple
const CUSTOMER_MARKUP = 2;

// Quality tiers — model IDs (costs are looked up per resolution below)
const QUALITY_MODELS = {
  standard: { id: "gemini-3.1-flash-image-preview" },
  hd:       { id: "gemini-3-pro-image-preview"     },
} as const;
type QualityTier = keyof typeof QUALITY_MODELS;

// Per-image USD cost by quality × resolution (source: Google AI Studio pricing)
const RESOLUTION_COSTS: Record<QualityTier, Record<string, number>> = {
  standard: { "512": 0.045, "1024": 0.067, "2048": 0.101, "4096": 0.151 },
  hd:       {               "1024": 0.134, "2048": 0.134, "4096": 0.240 },
};

// Resolution → pixel dimensions for Gemini API config
const RESOLUTION_SIZES: Record<string, { width: number; height: number }> = {
  "512":  { width: 512,  height: 512  },
  "1024": { width: 1024, height: 1024 },
  "2048": { width: 2048, height: 2048 },
  "4096": { width: 4096, height: 4096 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isHexColor(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!isHexColor(trimmed)) return null;
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function hexToColorName(hex: string): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "vibrant";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  if (r < 60 && g < 60 && b < 60) return "classic black";
  if (r > 150 && g > 140 && b > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 25) return "soft silver grey";
  if (r > 170 && g > 150 && b > 110 && r - b > 40) return "warm beige";
  if (r > 150 && g > 120 && b < 90) return "antique gold";
  if (r > 160 && g > 110 && b < 80) return "rich mustard";
  if (r > 160 && g > 70 && b < 80) return "burnt orange";
  if (r > 150 && g < 70 && b < 90) return "deep maroon";
  if (r > 190 && g < 100 && b < 120) return "crimson red";
  if (r > 170 && g > 90 && b > 140) return "rose pink";
  if (r > 130 && g > 90 && b > 150) return "regal lavender";
  if (r > 120 && g < 100 && b > 130) return "regal purple";
  if (r < 90 && g < 110 && b > 130) return "royal blue";
  if (r < 80 && g > 120 && b > 120) return "teal blue";
  if (r < 90 && g > 120 && b < 90) return "emerald green";
  if (r > 90 && g > 120 && b < 90) return "olive green";
  if (r > 200 && g > 180 && b < 120) return "golden yellow";
  if (r > 200 && g > 200 && b > 200) return "pristine white";
  return "vibrant";
}

function describeDominantColors(colors: string[]): string {
  const names = colors
    .map((color) => {
      const normalized = normalizeHexColor(color);
      return normalized ? hexToColorName(normalized) : color.trim().toLowerCase();
    })
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "rich traditional";
}

function getBackdropPromptLabel(backdrop: string, customBackdrop: string) {
  if (customBackdrop.trim()) return customBackdrop.trim();

  switch (backdrop) {
    case "studio":
      return "a premium studio set with soft diffused lighting, luxury styling, and a polished editorial finish";
    case "wedding":
      return "a grand South Indian wedding mandap with floral decor, rich festive tones, and elegant ceremonial lighting";
    case "temple":
      return "an ornate temple setting with carved pillars, devotional atmosphere, and warm golden light";
    case "park":
      return "a lush heritage park with landscaped greenery, soft daylight, and an upscale outdoor feel";
    case "garden":
      return "a curated flower garden with refined pathways, soft natural light, and premium botanical styling";
    default:
      return backdrop || "studio";
  }
}

function getFoldInstruction(foldStyle: string) {
  switch (foldStyle) {
    case "single-open-fold":
      return "Arrange the saree in a premium single open fold, with one elegant opening that reveals the border, pallu, and body motifs like a luxury boutique website hero image.";
    case "circular-fan-fold":
      return "Display the saree in a circular fan fold with dramatic radial pleats and a rich pallu reveal, styled like a premium bridal boutique display.";
    case "diagonal-luxury-fold":
      return "Arrange the saree diagonally across the frame in a luxury boutique fold, with the border sweeping across and the pallu partially opened for an upscale website presentation.";
    case "pallu-feature-fold":
      return "Create a premium folded display where the pallu is the hero element, opened and framed attractively while the body is folded beneath in an elegant website-ready layout.";
    case "butterfly-display-fold":
      return "Arrange the saree in a butterfly-style display fold with mirrored wings of fabric opening outward, revealing motifs and zari details in a striking premium layout.";
    case "designer-window-fold":
      return "Style the saree in a designer window-display fold, with carefully framed openings that reveal the body design, border, and pallu like a boutique storefront visual.";
    case "luxury-flatlay-fold":
      return "Present the saree in a luxury flat-lay fold with sculpted soft folds, premium spacing, and deliberate pallu placement so it feels aspirational and e-commerce ready.";
    case "bridal-hero-fold":
      return "Arrange the saree in a bridal hero fold with rich ceremonial drama, ornate pallu emphasis, and a grand premium presentation suited for festive and wedding collections.";
    default:
      return "";
  }
}

function getPleatedShowcaseInstruction(showcaseStyle: string) {
  switch (showcaseStyle) {
    case "classic-stand-display":
      return "Display the saree vertically on a premium showroom stand with the pallu draped neatly from the top and orderly lower pleats below, like a classic boutique presentation.";
    case "front-pleat-showcase":
      return "Create a front-facing pleated showcase with the lower pleats clearly fanned and visible below while the pallu remains elegantly revealed from the top.";
    case "side-pallu-showcase":
      return "Create a side-pallu vertical display where the pallu falls prominently from one side of the stand and the lower pleats remain refined and symmetrical.";
    case "boutique-hanger-display":
      return "Present the saree on an upscale boutique hanger or display bar, with an editorial pallu reveal and polished lower pleats suited for a luxury textile store.";
    case "royal-display-stand":
      return "Use a regal vertical stand presentation with the pallu featured grandly from the top and the lower pleats styled in an elegant ceremonial manner.";
    case "bridal-display-stand":
      return "Create a bridal boutique stand display with rich pallu emphasis, graceful lower pleats, and a premium festive showroom feel.";
    case "gallery-wall-display":
      return "Showcase the saree vertically against a refined gallery-style wall display, with the pallu suspended beautifully and the lower pleats arranged cleanly below.";
    default:
      return "";
  }
}

function getDesignLockInstruction(mode: "drape" | "folded" | "pleated") {
  const presentationOnly =
    mode === "drape"
      ? "model, pose, drape styling, lighting, and backdrop"
      : mode === "folded"
        ? "fold arrangement, camera angle, lighting, and backdrop"
        : "pleat arrangement, display stand styling, lighting, and backdrop";
  const sourceOfTruth =
    mode === "folded"
      ? "the uploaded saree image"
      : "Image 1 (body), Image 2 (border), and Image 3 (pallu)";

  return `DESIGN LOCK - NON-NEGOTIABLE:
- Treat ${sourceOfTruth} as the only source of truth for the saree.
- Treat this as a preservation edit request, not a redesign request and not a style-transfer request.
- Preserve the exact saree identity: colours, colour ratios, motif shapes, motif size, motif spacing, weave texture, zari shine, border width, border geometry, stripe count, and pallu layout.
- Do not invent, replace, beautify, simplify, modernise, redraw, reinterpret, or enhance any motif, border, pallu pattern, zari line, or woven detail.
- Change only the presentation: ${presentationOnly}.
- If a fold or drape hides part of the saree, the visible parts must still match the source exactly.
- If exact preservation is difficult, keep the source textile visually unchanged and reduce the amount of transformation instead of changing the saree.
- Forbidden changes: new motifs, changed border design, changed pallu design, altered colour palette, different zari pattern, different motif spacing, different border thickness, softened-away weave texture, smoothed motifs, or re-imagined body layout.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const {
      images,
      mode,
      style,
      viewAngle,
      backdrop,
      addJewellery,
      customPrompts,
      logoId,
      aiModel: _aiModel,
      pose,
      foldStyle,
      pleatedShowcaseStyle,
      modelLook,
      dominantColors = [],
      borderDominantColors = [],
      materialName,
      organization_id: orgId,
      quality: qualityParam,
      resolution: resolutionParam,
    } = body;

    const quality: QualityTier = qualityParam === "hd" ? "hd" : "standard";
    const selectedModel = QUALITY_MODELS[quality];

    // Validate resolution — HD doesn't support 512px
    const validResolutions = Object.keys(RESOLUTION_COSTS[quality]);
    const resolution: string = validResolutions.includes(String(resolutionParam)) ? String(resolutionParam) : "1024";
    const imageSizes = RESOLUTION_SIZES[resolution];

    // --- Authorization: org member OR legacy global admin ---
    let authorizedOrgId: string | null = null;

    if (orgId) {
      // SaaS path: check org membership
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Not a member of this organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authorizedOrgId = orgId;
    } else {
      // Legacy path: require global admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const fetchUsdToInrRate = async (): Promise<number> => {
      try {
        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!response.ok) throw new Error(`FX API failed: ${response.status}`);
        const fxData = await response.json();
        const inrRate = fxData?.rates?.INR;
        if (typeof inrRate !== "number" || Number.isNaN(inrRate) || inrRate <= 0) {
          throw new Error("Invalid INR rate in FX response");
        }
        return inrRate;
      } catch (err) {
        console.warn("Falling back to default USD/INR rate", err);
        return DEFAULT_USD_TO_INR;
      }
    };

    const usdToInrRate = await fetchUsdToInrRate();
    const COST_PER_IMAGE_USD = RESOLUTION_COSTS[quality][resolution];          // actual API cost
    const actualCostInr      = Number((COST_PER_IMAGE_USD * usdToInrRate).toFixed(2));
    const chargedAmountInr   = Number((actualCostInr * CUSTOMER_MARKUP).toFixed(2)); // what customer pays

    // ---- Wallet check & debit (prepaid) ----
    const LOW_BALANCE_THRESHOLD_INR = 50; // freeze generation below this balance

    if (authorizedOrgId) {
      // Pre-check: fetch current balance to enforce low-balance freeze
      const { data: walletRow } = await supabase
        .from("org_wallets")
        .select("balance_inr")
        .eq("organization_id", authorizedOrgId)
        .maybeSingle();

      const currentBalance = walletRow?.balance_inr ?? 0;
      if (currentBalance <= LOW_BALANCE_THRESHOLD_INR) {
        return new Response(
          JSON.stringify({
            error: `Your wallet balance (₹${currentBalance.toFixed(2)}) is below the minimum threshold of ₹${LOW_BALANCE_THRESHOLD_INR}. Please recharge to continue generating images.`,
            code: "LOW_BALANCE",
            balance: currentBalance,
            threshold: LOW_BALANCE_THRESHOLD_INR,
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: debitResult, error: debitErr } = await supabase.rpc("debit_wallet", {
        p_org_id:      authorizedOrgId,
        p_amount_inr:  chargedAmountInr,
        p_description: `Image generation (${quality}, ${resolution}px) — ${mode}`,
        p_user_id:     userId,
      });

      if (debitErr) {
        console.error("Wallet debit error:", debitErr);
        return new Response(
          JSON.stringify({ error: "Wallet service error. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = debitResult as { success: boolean; error?: string; balance?: number; required?: number };
      if (!result?.success) {
        const available = result?.balance ?? 0;
        const required  = result?.required ?? chargedAmountInr;
        return new Response(
          JSON.stringify({
            error: `Insufficient wallet balance. Available: ₹${available.toFixed(2)}, Required: ₹${required.toFixed(2)}. Please top up your wallet to continue.`,
            code: "INSUFFICIENT_BALANCE",
            balance: available,
            required,
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const generationTypeMap: Record<string, string> = {
      drape: style === "full" ? "model_drape_full" : "model_drape_half",
      folded: "folded_display",
      fleeted: "folded_display",
    };
    const generationType = generationTypeMap[mode] || "folded_display";

    // Insert usage log
    const { data: logEntry, error: logError } = await supabase.from("usage_logs").insert({
      user_id: userId,
      organization_id: authorizedOrgId,
      generation_type: generationType,
      status: "pending",
      prompt_summary: `${mode} | ${selectedModel.id} (${quality}, ${resolution}px) | ${style || "default"} | ${viewAngle || "front"} | ${backdrop || "studio"}`,
      cost_inr: chargedAmountInr,   // amount deducted from customer wallet (2× actual)
      cost_usd: COST_PER_IMAGE_USD, // actual API cost for reference
      usd_to_inr_rate: Number(usdToInrRate.toFixed(4)),
    }).select("id").single();
    if (logError) console.error("Failed to insert log:", logError);

    // ============ Build prompt ============
    const backdropText = getBackdropPromptLabel(backdrop, customPrompts?.backdrop || "");
    const colorDesc = describeDominantColors(dominantColors);
    const borderColorDesc = describeDominantColors(borderDominantColors);

    const poseMap: Record<string, string> = {
      "random-cinematic": "choose a premium cinematic saree pose that best preserves the drape and textile details",
      "front-showcase": "Front Showcase Pose - front-facing full-length stance with the saree drape clearly visible",
      "side-profile": "Side Profile Pose - side-facing full-length stance that highlights border flow and pallu fall",
      "t-showcase": "T Showcase Pose - full-length product pose with both arms gently extended to display the saree spread clearly",
      "elegance-personified": "Elegance Personified",
      "jharokha-gaze": "The Jharokha Gaze",
      "heritage-pillar": "Heritage Pillar",
      "pallu-flow": "The Pallu Flow",
      "monsoon-mist": "Monsoon Mist",
      "urban-contrast": "Urban Contrast",
      "golden-hour": "Golden Hour Solitude",
      "royal-seating": "Royal Seating",
      "floating-fabric": "Floating Fabric",
      "mirror-reflection": "Mirror Reflection",
      "stairway-glamour": "Stairway to Glamour",
      "architectural-arch": "Architectural Arch",
      "peacock-chair": "Peacock Chair Pose",
      "bridal-sitting": "Bridal Sitting",
      "temple-dancer": "Temple Dancer",
      "garden-stroll": "Garden Stroll",
      "royal-balcony": "Royal Balcony",
      "lotus-stance": "Lotus Stance",
      "drape-reveal": "Drape Reveal",
      "classical-namaste": "Classical Namaste",
      "walk-towards-camera": "Walk Towards Camera",
      "over-shoulder-glance": "Over Shoulder Glance",
    };
    const poseText = customPrompts?.pose || poseMap[pose] || "Elegance Personified";

    const modelDescriptions: Record<string, string> = {
      "south-indian": "beautiful AI-generated virtual South Indian fashion model with traditional features and wheatish complexion, clearly CGI rendered",
      "north-indian": "beautiful AI-generated virtual North Indian fashion model with fair complexion and sharp features, clearly CGI rendered",
      "dusky": "stunning AI-generated virtual Indian fashion model with deep dusky complexion and strong elegant features, clearly CGI rendered",
      "young-bride": "beautiful AI-generated virtual young Indian bride fashion model in her mid-20s with full bridal makeup, clearly CGI rendered",
      "mature-elegant": "graceful AI-generated virtual Indian fashion model in her 40s with elegant poise, clearly CGI rendered",
      "tam-brahmin": "beautiful AI-generated virtual Tamil Brahmin fashion model with traditional features, devotional styling, and elegant restraint",
      "rajasthani": "beautiful AI-generated virtual Rajasthani fashion model with vivid ethnic styling and regal traditional presence",
      "bengali": "beautiful AI-generated virtual Bengali fashion model with graceful traditional styling and refined elegance",
      "teen-college": "young AI-generated Indian fashion model with a fresh modern look and light youthful styling",
      "professional": "confident AI-generated Indian fashion model with polished professional styling and composed posture",
    };
    const modelDesc = modelDescriptions[modelLook] || modelDescriptions["south-indian"];

    const faceStyleInstruction = style === "mannequin"
      ? "female mannequin doll only (no real human face)"
      : style === "half" || pose === "side-profile"
        ? "profile or three-quarter facial visibility, with only part of the face presented prominently"
        : "full face clearly visible while still allowing a cinematic body pose and natural head direction";
    const viewAngleInstruction = viewAngle === "side"
      ? "strict side pose"
      : "strict front pose";

    // Collect reference images (raw base64 from frontend)
    const referenceImages = ["body", "border", "pallu", "saree"].map(k => images?.[k]).filter(Boolean) as string[];
    const hasImages = referenceImages.length > 0;

    let generationPrompt = "";
    switch (mode) {
      case "drape":
        generationPrompt = `You are a world-class fashion photographer AI specialising in Indian ethnic wear.

You are given multiple reference images of a saree:
- Image 1: Saree body fabric (main weave, motifs, texture, colours: ${colorDesc})
- Image 2: Border (BR) design (border colours: ${borderColorDesc})
- Image 3: Pallu design
${images?.blouse ? "- Image 4: Blouse fabric" : ""}

Your task: Create one single photorealistic, high-fashion image of ${style === "mannequin" ? "a faceless, neutral dress mannequin in traditional Indian nivi style. No human model, no face, no skin." : "a fully AI-generated model (not a real person) wearing this entire saree, draped in traditional Indian nivi style."}

Model details:
- Appearance: ${modelDesc}
- Face angle: ${faceStyleInstruction}
- View angle: ${viewAngleInstruction}
- Pose: ${poseText}
- Jewellery: ${addJewellery ? "wearing traditional gold jewellery (necklace, earrings, bangles, maang tikka)" : "minimal or no jewellery"}
- Background: ${backdropText}

${getDesignLockInstruction("drape")}

CRITICAL - strictly follow these rules without deviation:
- EXACT colours from Image 1 - do not alter, reinterpret, or shift any colour
- EXACT body motifs and weave pattern from Image 1 - reproduce every detail faithfully
- EXACT border pattern from Image 2 must be clearly visible along the saree edges
- BORDER DESIGN AND COLOUR LOCK: The border (Image 2) is ${borderColorDesc} - reproduce it as exactly this colour with zero deviation. Do not alter the border pattern, motif geometry, stripe count, or zari details in any way.
- EXACT pallu design from Image 3 must be prominently shown draped over the shoulder
${images?.blouse ? "- EXACT blouse fabric/colour from Image 4" : "- Include a tasteful complementary blouse"}
- Full-length shot showing the entire drape, sharp and high-resolution
- Professional fashion photography lighting suited to the backdrop
- The saree must remain recognisably the exact same product as the reference images`;
        break;
      case "folded":
        generationPrompt = `You are a professional product photographer AI specialising in Indian textiles.

Your task: Create a premium product display photograph that changes only the fold or presentation of the uploaded saree image. The textile design itself must remain the exact same saree (body colours: ${colorDesc}, border colours: ${borderColorDesc}).

Display setting: ${backdropText}
${getFoldInstruction(foldStyle) || "Choose a premium-looking fold arrangement that best reveals the saree without changing its design."}

${getDesignLockInstruction("folded")}

Requirements:
- Fold the saree in a visually appealing arrangement that reveals as much original body, border, and pallu detail as possible
- Clearly showcase the original fabric weave, motifs, zari work, and border without changing any of them
- BORDER DESIGN AND COLOUR LOCK: The border or edge strip is ${borderColorDesc} - reproduce it as exactly this colour with zero deviation.
- Keep the textile flat and faithful enough that a customer can match the generated image to the physical saree without doubt
- Never create a single flat fold; show 3-5 clean layered folds with a premium boutique presentation
- Professional product photography lighting with soft shadows
- Clean background, high resolution
- Preserve the exact border design, motif spacing, motif scale, and colour balance from the uploaded saree`;
        break;
      case "fleeted":
        generationPrompt = `You are a professional product photographer AI specialising in Indian textile display photography.

You are given reference images of a saree:
- Image 1: Saree body fabric (main weave, motifs, texture, colours: ${colorDesc})
- Image 2: Border (BR) pattern (border colours: ${borderColorDesc})
- Image 3: Pallu design

Your task: Create a saree display photograph exactly like a traditional saree shop display. The saree is draped and hung vertically on a display stand, hanger, or rack. The pallu hangs straight down from the top of the stand, the body fabric is neatly folded or stacked below, and the border runs along the edges. No human model.

Display background: ${backdropText}
${getPleatedShowcaseInstruction(pleatedShowcaseStyle) || "Choose a premium-looking pleat arrangement that best reveals the saree without changing its design."}

${getDesignLockInstruction("pleated")}

CRITICAL - strictly follow these colour and design rules:
- EXACT colours from Image 1 - do not change, alter, saturate, or reinterpret any colour
- EXACT body motifs and weave pattern from Image 1 - reproduce every motif faithfully
- EXACT border pattern from Image 2 must appear along the saree edges
- BORDER COLOUR LOCK: The border (Image 2) is ${borderColorDesc} - render it as exactly this colour
- EXACT pallu design from Image 3 must be prominently visible hanging from the top
- Keep pleats conservative and presentation-led if needed so the visible textile remains faithful to the reference
- Professional product photography lighting - soft, even, no harsh shadows
- High resolution, sharp fabric details
- Magazine-quality composition
- The saree must remain recognisably the exact same product as the reference images`;
        break;
      default:
        throw new Error("Invalid mode");
    }

    // ============ Call Google Gemini API ============
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");

    const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel.id}:generateContent?key=${GOOGLE_API_KEY}`;

    // Build request parts
    const parts: any[] = [];

    // Add reference images if available
    if (hasImages) {
      for (const img of referenceImages) {
        // Strip data URI prefix if present
        let rawBase64 = img;
        let mimeType = "image/jpeg";
        if (img.startsWith("data:")) {
          const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            rawBase64 = match[2];
          }
        }
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: rawBase64,
          },
        });
      }
    }

    // Add text prompt
    parts.push({ text: generationPrompt.substring(0, 2000) });

    const geminiBody = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        temperature: 1,
        topP: 0.95,
        topK: 40,
        imageGenerationConfig: {
          numberOfImages: 1,
          width: imageSizes.width,
          height: imageSizes.height,
        },
      },
    };

    console.log(`Using Google Gemini | model=${selectedModel.id} | quality=${quality} | resolution=${resolution}px | mode=${mode} | refs=${referenceImages.length} | promptLen=${generationPrompt.length}`);

    // Retry logic (up to 3 attempts)
    let imageBase64Result = "";
    let lastError = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(GEMINI_IMAGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Gemini API error (attempt ${attempt}):`, response.status, errText);
          lastError = `Gemini API failed: ${response.status} — ${errText.substring(0, 300)}`;
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(lastError);
        }

        const data = await response.json();

        // Extract image from response
        const candidates = data?.candidates;
        if (!candidates || candidates.length === 0) {
          lastError = "No candidates in Gemini response";
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(lastError);
        }

        const responseParts = candidates[0]?.content?.parts || [];
        let foundImage = false;
        for (const part of responseParts) {
          if (part.inlineData || part.inline_data) {
            const inlineData = part.inlineData || part.inline_data;
            const mime = inlineData.mimeType || inlineData.mime_type || "image/png";
            imageBase64Result = `data:${mime};base64,${inlineData.data}`;
            foundImage = true;
            break;
          }
        }

        if (!foundImage) {
          lastError = "No image in Gemini response parts";
          console.error("Response parts:", JSON.stringify(responseParts.map((p: any) => Object.keys(p))));
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(lastError);
        }

        // Success
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        console.warn(`Attempt ${attempt} failed, retrying...`, e);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let socialCaption = "";
    try {
      const captionPrompt = `Write one premium Instagram-ready caption (max 45 words) for an Indian saree ${mode} image. Material: ${materialName || "silk blend"}. Color hint: ${colorDesc || "rich handcrafted tones"}. Return plain text only.`;
      const captionUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CAPTION_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
      const captionResp = await fetch(captionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: captionPrompt }] }],
          generationConfig: { temperature: 0.7, topP: 0.9, topK: 32 },
        }),
      });
      if (captionResp.ok) {
        const captionJson = await captionResp.json();
        socialCaption = captionJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || "";
      } else {
        console.warn("Caption generation skipped: non-OK response", captionResp.status);
      }
    } catch (captionErr) {
      console.warn("Caption generation failed", captionErr);
    }

    // Mark success
    if (logEntry?.id) {
      await supabase.from("usage_logs").update({ status: "success" }).eq("id", logEntry.id);
    }

    console.log("Image generation complete via Google Gemini");

    return new Response(
      JSON.stringify({ imageBase64: imageBase64Result, socialCaption }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-saree error:", e);
    // The wallet was already debited before generation started. We can't easily
    // issue a refund here without knowing orgId/cost (they're in the inner scope).
    // Generation errors after debit are handled via usage_log status='error'.
    // For a full refund flow, use the wallet-topup function manually.
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
