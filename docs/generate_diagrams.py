import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# PALETTE
# ─────────────────────────────────────────────────────────────────────────────
BG          = "#0D1117"
PANEL       = "#161B22"
BORDER      = "#30363D"

C_SOURCE    = "#2EA043"   # green
C_INGEST    = "#388BFD"   # blue
C_ENGINE    = "#A371F7"   # purple
C_TEMPLATE  = "#3FB950"   # lime
C_ROUTER    = "#D29922"   # amber
C_ADAPTER   = "#F78166"   # coral/orange
C_AUDIT     = "#58A6FF"   # sky
C_AUTH      = "#BC8CFF"   # violet
C_ADMIN     = "#8B949E"   # grey
C_UI        = "#39D353"   # bright green
C_MQ        = "#FF7B72"   # pink/red (RabbitMQ)
C_PROVIDER  = "#6E7681"   # dark grey

FONT = "DejaVu Sans Mono"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def rounded_box(ax, x, y, w, h, edge_color, label, sub=None, port=None,
                label_size=8, sub_size=6.5, zorder=3, alpha_fill=0.12, radius=0.008):
    face = edge_color
    rect = FancyBboxPatch((x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=1.4, edgecolor=edge_color,
        facecolor=face + hex(int(alpha_fill * 255))[2:].zfill(2),
        zorder=zorder)
    ax.add_patch(rect)
    # top accent bar
    bar_h = min(0.016, h * 0.18)
    bar = FancyBboxPatch((x, y + h - bar_h), w, bar_h,
        boxstyle=f"round,pad=0,rounding_size=0.003",
        linewidth=0, facecolor=edge_color, zorder=zorder + 1)
    ax.add_patch(bar)
    # labels
    n_lines = (1 if sub is None else 2) + (1 if port else 0)
    center_y = y + h / 2
    offsets = []
    if port and sub:
        offsets = [0.020, -0.002, -0.024]
    elif port:
        offsets = [0.010, -0.012]
    elif sub:
        offsets = [0.012, -0.012]
    else:
        offsets = [0]
    texts = [label]
    if sub: texts.append(sub)
    if port: texts.append(port)
    sizes = [label_size] + ([sub_size] if sub else []) + ([6] if port else [])
    colors = ['white'] + ([edge_color] if sub else []) + (['#8B949E'] if port else [])
    weights = ['bold'] + (['normal'] if sub else []) + (['normal'] if port else [])
    for txt, sz, col, wt, off in zip(texts, sizes, colors, weights, offsets):
        ax.text(x + w/2, center_y + off, txt,
                ha='center', va='center', fontsize=sz, fontweight=wt,
                color=col, fontfamily=FONT, zorder=zorder + 2)


def horiz_arrow(ax, x1, x2, y, color, label=None, lw=1.5, rad=0.0,
                label_above=True, zorder=5):
    ax.annotate("", xy=(x2, y), xytext=(x1, y),
                arrowprops=dict(arrowstyle="-|>",
                                color=color, lw=lw,
                                mutation_scale=10,
                                connectionstyle=f"arc3,rad={rad}",
                                shrinkA=4, shrinkB=4),
                zorder=zorder)
    if label:
        mx = (x1 + x2) / 2
        dy = 0.012 if label_above else -0.015
        ax.text(mx, y + dy, label, ha='center', va='center',
                fontsize=5.5, color=color, fontfamily=FONT, zorder=zorder + 1,
                bbox=dict(boxstyle='round,pad=0.15', fc=BG, ec='none', alpha=0.9))


def vert_arrow(ax, x, y1, y2, color, lw=1.5, label=None, zorder=5):
    ax.annotate("", xy=(x, y2), xytext=(x, y1),
                arrowprops=dict(arrowstyle="-|>",
                                color=color, lw=lw,
                                mutation_scale=10,
                                shrinkA=4, shrinkB=4),
                zorder=zorder)
    if label:
        ax.text(x + 0.008, (y1 + y2) / 2, label,
                ha='left', va='center', fontsize=5.5,
                color=color, fontfamily=FONT, zorder=zorder + 1)


def mq_bubble(ax, cx, cy, text, color=C_MQ, width=0.20, height=0.030, zorder=6):
    rect = FancyBboxPatch((cx - width/2, cy - height/2), width, height,
        boxstyle="round,pad=0,rounding_size=0.008",
        linewidth=1.2, edgecolor=color,
        facecolor=BG, zorder=zorder)
    ax.add_patch(rect)
    ax.text(cx, cy + 0.004, text, ha='center', va='center',
            fontsize=5.8, color=color, fontfamily=FONT,
            fontweight='bold', zorder=zorder + 1)
    ax.text(cx, cy - 0.009, "RabbitMQ", ha='center', va='center',
            fontsize=5, color=color + "99", fontfamily=FONT,
            style='italic', zorder=zorder + 1)


def step_badge(ax, x, y, num, color, zorder=8):
    circle = plt.Circle((x, y), 0.014, color=color, zorder=zorder)
    ax.add_patch(circle)
    ax.text(x, y, str(num), ha='center', va='center',
            fontsize=6, color='white', fontfamily=FONT,
            fontweight='bold', zorder=zorder + 1)


# ═════════════════════════════════════════════════════════════════════════════
# DIAGRAM 1 — HIGH-LEVEL ARCHITECTURE
# ═════════════════════════════════════════════════════════════════════════════
def make_hla():
    W, H = 24, 15
    fig, ax = plt.subplots(figsize=(W, H))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    # ── Row definitions (y_bottom, y_top) — strict, no overlaps ──────────
    R_TITLE   = (0.955, 1.000)
    R_SOURCE  = (0.880, 0.945)
    R_INGEST  = (0.775, 0.870)
    R_MQ1     = (0.748, 0.768)   # xch.events.normalized
    R_ENGINE  = (0.620, 0.738)   # Engine + Template side-by-side
    R_MQ2     = (0.593, 0.613)   # xch.notifications.deliver
    R_ROUTER  = (0.460, 0.583)   # Router (left) + Audit (right) + MQ-status (far right)
    R_MQ3     = (0.433, 0.453)   # xch.notifications.status (right)
    R_ADAPT   = (0.305, 0.425)   # 4 adapters full-width
    R_PROV    = (0.185, 0.295)   # external providers full-width
    R_SUPP1   = (0.095, 0.170)   # support services row A
    R_SUPP2   = (0.030, 0.085)   # support services row B
    R_LEGEND  = (0.000, 0.025)

    def row_mid(r): return (r[0] + r[1]) / 2
    def row_h(r):   return r[1] - r[0]

    # ── Title ──────────────────────────────────────────────────────────────
    ax.text(0.5, 0.978, "Notification API — High-Level Architecture",
            ha='center', va='center', fontsize=20, fontweight='bold',
            color='white', fontfamily=FONT)
    ax.text(0.5, 0.960, "Event-driven microservices  ·  NestJS  ·  RabbitMQ  ·  PostgreSQL",
            ha='center', va='center', fontsize=10, color='#8B949E', fontfamily=FONT)

    # ── SOURCE SYSTEMS ─────────────────────────────────────────────────────
    src_bg = FancyBboxPatch((0.01, R_SOURCE[0]), 0.98, row_h(R_SOURCE),
        boxstyle="round,pad=0,rounding_size=0.008",
        linewidth=1, edgecolor=C_SOURCE + "55", facecolor=C_SOURCE + "0D", zorder=1)
    ax.add_patch(src_bg)
    ax.text(0.025, R_SOURCE[1] - 0.008, "SOURCE SYSTEMS", fontsize=6.5,
            fontweight='bold', color=C_SOURCE, fontfamily=FONT, va='top', alpha=0.85)

    sources = ["OMS", "Magento 2", "Mirakl", "Chat\nCommerce", "Legacy ERP", "Email\nIngest"]
    sw, sx0 = 0.125, 0.045
    sgap = (0.91 - len(sources) * sw) / (len(sources) - 1)
    inner_h = row_h(R_SOURCE) - 0.022
    inner_y = R_SOURCE[0] + 0.010
    for i, s in enumerate(sources):
        bx = sx0 + i * (sw + sgap)
        rounded_box(ax, bx, inner_y, sw, inner_h, C_SOURCE, s,
                    label_size=8, radius=0.006, alpha_fill=0.12)

    # arrow sources → ingestion
    ax.annotate("", xy=(0.500, R_SOURCE[0]), xytext=(0.500, inner_y),
                arrowprops=dict(arrowstyle="-|>", color=C_SOURCE, lw=2.0,
                                mutation_scale=13, shrinkA=0, shrinkB=0), zorder=6)
    ax.text(0.515, R_SOURCE[0] + 0.005, "AMQP / Webhook / SMTP",
            fontsize=6.5, color=C_SOURCE, fontfamily=FONT, va='bottom')

    # ── EVENT INGESTION ────────────────────────────────────────────────────
    ing_x, ing_w = 0.310, 0.380
    ing_y, ing_h = R_INGEST[0], row_h(R_INGEST)
    rounded_box(ax, ing_x, ing_y, ing_w, ing_h, C_INGEST,
                "event-ingestion-service",
                "Normalize · Validate · Assign Priority", ":3151",
                label_size=10, sub_size=7.5)

    # MQ1: xch.events.normalized
    mq1_cx = 0.500
    mq1_cy = row_mid(R_MQ1)
    mq_bubble(ax, mq1_cx, mq1_cy, "xch.events.normalized", C_MQ, width=0.270, height=0.034)
    vert_arrow(ax, mq1_cx, ing_y, mq1_cy + 0.017, C_MQ, lw=1.5)

    # ── ENGINE + TEMPLATE ──────────────────────────────────────────────────
    eng_x, eng_w = 0.215, 0.370
    eng_y, eng_h = R_ENGINE[0], row_h(R_ENGINE)
    rounded_box(ax, eng_x, eng_y, eng_w, eng_h, C_ENGINE,
                "notification-engine-service",
                "Rules · Recipients · Suppress · Dispatch", ":3152",
                label_size=10, sub_size=7.5)

    # fan-out from MQ1 → Engine queues
    for x_dst, lbl in [(0.300, "event.critical.#"), (0.430, "event.normal.#")]:
        ax.annotate("", xy=(x_dst, R_ENGINE[1]),
                    xytext=(mq1_cx, mq1_cy - 0.017),
                    arrowprops=dict(arrowstyle="-|>", color=C_MQ, lw=1.3,
                                    mutation_scale=9, shrinkA=3, shrinkB=3), zorder=5)
        ax.text((x_dst + mq1_cx)/2 - 0.02, (R_ENGINE[1] + mq1_cy)/2,
                lbl, fontsize=5.5, color=C_MQ, fontfamily=FONT, ha='center')

    # Template Service
    tmpl_x, tmpl_w = 0.660, 0.320
    tmpl_y = R_ENGINE[0] + (row_h(R_ENGINE) - 0.092) / 2
    tmpl_h = 0.092
    rounded_box(ax, tmpl_x, tmpl_y, tmpl_w, tmpl_h, C_TEMPLATE,
                "template-service",
                "Handlebars Render · Versioning", ":3153",
                label_size=9, sub_size=7.5)

    eng_right = eng_x + eng_w
    tmpl_left = tmpl_x
    mid_arrow_y1 = tmpl_y + tmpl_h * 0.62
    mid_arrow_y2 = tmpl_y + tmpl_h * 0.38
    horiz_arrow(ax, eng_right, tmpl_left, mid_arrow_y1, C_TEMPLATE,
                "POST /render", lw=1.4, label_above=True)
    horiz_arrow(ax, tmpl_left, eng_right, mid_arrow_y2, C_TEMPLATE,
                "rendered content", lw=1.4, label_above=False)

    # MQ2: xch.notifications.deliver
    mq2_cx = eng_x + eng_w * 0.45
    mq2_cy = row_mid(R_MQ2)
    mq_bubble(ax, mq2_cx, mq2_cy, "xch.notifications.deliver", C_MQ, width=0.270, height=0.034)
    vert_arrow(ax, mq2_cx, eng_y, mq2_cy + 0.017, C_MQ, lw=1.5)

    # ── CHANNEL ROUTER + AUDIT ─────────────────────────────────────────────
    rtr_x, rtr_w = 0.200, 0.390
    rtr_y, rtr_h = R_ROUTER[0], row_h(R_ROUTER)
    rounded_box(ax, rtr_x, rtr_y, rtr_w, rtr_h, C_ROUTER,
                "channel-router-service",
                "Retry · Circuit Breaker · Rate Limit · Fallback", ":3154",
                label_size=10, sub_size=7.5)

    vert_arrow(ax, mq2_cx, mq2_cy - 0.017, rtr_y + rtr_h, C_MQ, lw=1.5,
               label="q.deliver.{ch}.{priority}")

    # Audit Service (right column, beside Router)
    aud_x, aud_w = 0.660, 0.320
    aud_y = rtr_y + (rtr_h - 0.092) / 2
    aud_h = 0.092
    rounded_box(ax, aud_x, aud_y, aud_w, aud_h, C_AUDIT,
                "audit-service",
                "Tracking · Receipts · Analytics", ":3156",
                label_size=9, sub_size=7.5)

    # MQ3: xch.notifications.status (sits below Router row on right)
    mq3_cx = aud_x + aud_w / 2
    mq3_cy = row_mid(R_MQ3)
    mq_bubble(ax, mq3_cx, mq3_cy, "xch.notifications.status", C_MQ, width=0.270, height=0.034)

    # engine → status
    ax.annotate("", xy=(mq3_cx - 0.060, mq3_cy + 0.017),
                xytext=(eng_x + eng_w, R_ENGINE[0] + eng_h * 0.55),
                arrowprops=dict(arrowstyle="-|>", color=C_MQ, lw=1.2,
                                mutation_scale=9, shrinkA=3, shrinkB=3,
                                connectionstyle="arc3,rad=-0.25"), zorder=5)
    ax.text(0.720, R_ENGINE[0] + 0.040, "notification.status.*",
            fontsize=5.5, color=C_MQ, fontfamily=FONT)

    # router → status
    ax.annotate("", xy=(mq3_cx - 0.100, mq3_cy + 0.017),
                xytext=(rtr_x + rtr_w, rtr_y + rtr_h * 0.45),
                arrowprops=dict(arrowstyle="-|>", color=C_MQ, lw=1.2,
                                mutation_scale=9, shrinkA=3, shrinkB=3,
                                connectionstyle="arc3,rad=-0.15"), zorder=5)

    # status → audit (down)
    vert_arrow(ax, mq3_cx, aud_y, mq3_cy + 0.017, C_MQ, lw=1.4)

    # status → engine (webhook delivery confirmations — curved back)
    ax.annotate("", xy=(eng_x + eng_w * 0.40, eng_y),
                xytext=(mq3_cx - 0.050, mq3_cy - 0.017),
                arrowprops=dict(arrowstyle="-|>", color=C_MQ + "CC", lw=1.1,
                                mutation_scale=8, shrinkA=3, shrinkB=3,
                                connectionstyle="arc3,rad=0.30"), zorder=5)
    ax.text(0.500, R_ROUTER[0] - 0.005, "status.delivered / failed → Engine",
            fontsize=5.5, color=C_MQ + "BB", fontfamily=FONT, ha='center')

    # ── PROVIDER ADAPTERS (full-width row, below Router) ───────────────────
    adapters = [
        ("adapter-mailgun",  ":3171", C_ADAPTER,  0.012),
        ("adapter-whatsapp", ":3173", "#22C7D4",  0.258),
        ("adapter-braze",    ":3172", "#E879F9",  0.504),
        ("adapter-aws-ses",  ":3174", "#FBBF24",  0.750),
    ]
    aw = 0.228
    adp_y, adp_h = R_ADAPT[0], row_h(R_ADAPT)
    rtr_cx = rtr_x + rtr_w / 2
    for name, port, col, bx in adapters:
        rounded_box(ax, bx, adp_y, aw, adp_h, col, name, port=port,
                    label_size=8.5, radius=0.007)
        cx_adap = bx + aw / 2
        # router → adapter (arrows from router bottom to adapter top)
        ax.annotate("", xy=(cx_adap, adp_y + adp_h),
                    xytext=(rtr_cx, rtr_y),
                    arrowprops=dict(arrowstyle="-|>", color=col, lw=1.4,
                                    mutation_scale=9, shrinkA=4, shrinkB=4,
                                    connectionstyle="arc3,rad=0.0"), zorder=5)
        # POST /send label (only on middle two to avoid clutter)
        if name in ("adapter-whatsapp", "adapter-braze"):
            mx = (rtr_cx + cx_adap) / 2
            my = (rtr_y + adp_y + adp_h) / 2 + 0.012
            ax.text(mx, my, "POST /send", fontsize=5.5, color=col,
                    fontfamily=FONT, ha='center',
                    bbox=dict(boxstyle='round,pad=0.15', fc=BG, ec='none', alpha=0.9))

    # adapter → status (webhook, from adapter row to MQ3)
    ax.annotate("", xy=(mq3_cx + 0.080, mq3_cy - 0.017),
                xytext=(adapters[-1][3] + aw * 0.7, adp_y + adp_h),
                arrowprops=dict(arrowstyle="-|>", color=C_MQ, lw=1.1,
                                mutation_scale=8, shrinkA=3, shrinkB=3,
                                connectionstyle="arc3,rad=-0.20"), zorder=5)
    ax.text(0.870, (mq3_cy + adp_y + adp_h) / 2, "adapter.webhook.{id}",
            fontsize=5.5, color=C_MQ, fontfamily=FONT, ha='center')

    # ── EXTERNAL PROVIDERS ─────────────────────────────────────────────────
    ext_bg = FancyBboxPatch((0.01, R_PROV[0]), 0.98, row_h(R_PROV),
        boxstyle="round,pad=0,rounding_size=0.008",
        linewidth=1, edgecolor=C_PROVIDER + "55", facecolor=C_PROVIDER + "0D", zorder=1)
    ax.add_patch(ext_bg)
    ax.text(0.025, R_PROV[1] - 0.008, "EXTERNAL PROVIDERS", fontsize=6.5,
            fontweight='bold', color=C_PROVIDER, fontfamily=FONT, va='top', alpha=0.85)

    providers = ["Mailgun\n(Email)", "WhatsApp\nMeta Cloud", "Braze\nMulti-channel", "AWS SES\n(Email)"]
    prov_inner_y = R_PROV[0] + 0.012
    prov_inner_h = row_h(R_PROV) - 0.025
    for i, (p_lbl, (name, port, col, bx)) in enumerate(zip(providers, adapters)):
        px = bx
        rounded_box(ax, px, prov_inner_y, aw, prov_inner_h, C_PROVIDER, p_lbl,
                    label_size=8, radius=0.006, alpha_fill=0.08)
        cx_adap = bx + aw / 2
        cx_prov = px + aw / 2
        ax.annotate("", xy=(cx_prov, R_PROV[1]),
                    xytext=(cx_adap, adp_y),
                    arrowprops=dict(arrowstyle="<|-|>", color=col, lw=1.2,
                                    mutation_scale=9, shrinkA=3, shrinkB=3), zorder=5)

    # ── SUPPORT SERVICES ROW A (4 boxes) ──────────────────────────────────
    # ecommerce-backoffice, auth-rbac-backend, auth-rbac-frontend, notification-admin-ui
    supp_a = [
        ("ecommerce-backoffice",       "Login Portal & Launcher", ":3162", "#8957E5"),
        ("auth-rbac-service-backend",  "JWT RS256 · Users · RBAC", ":3160", C_AUTH),
        ("auth-rbac-service-frontend", "RBAC Admin UI", ":3161",  C_AUTH),
        ("notification-admin-ui",      "Next.js Admin", ":3159",  "#39D353"),
    ]
    n_a = len(supp_a)
    sa_w = (0.98 - 0.01 - (n_a - 1) * 0.012) / n_a
    sa_y, sa_h = R_SUPP1[0], row_h(R_SUPP1)
    for i, (name, sub, port, col) in enumerate(supp_a):
        bx = 0.01 + i * (sa_w + 0.012)
        rounded_box(ax, bx, sa_y, sa_w, sa_h, col, name, sub, port,
                    label_size=7.5, sub_size=6.5, radius=0.006)

    # ── SUPPORT SERVICES ROW B (3 boxes) ──────────────────────────────────
    # admin-service, bulk-upload-service, email-ingest-service
    supp_b = [
        ("admin-service",       "Config Management (CRUD)", ":3155", C_ADMIN),
        ("bulk-upload-service", "XLSX Async Upload",        ":3158", "#F0883E"),
        ("email-ingest-service","SMTP Ingest",              ":3157", "#79C0FF"),
    ]
    n_b = len(supp_b)
    sb_w = (0.98 - 0.01 - (n_b - 1) * 0.012) / n_b
    sb_y, sb_h = R_SUPP2[0], row_h(R_SUPP2)
    for i, (name, sub, port, col) in enumerate(supp_b):
        bx = 0.01 + i * (sb_w + 0.012)
        rounded_box(ax, bx, sb_y, sb_w, sb_h, col, name, sub, port,
                    label_size=7.5, sub_size=6.5, radius=0.006)

    # separator line above support rows
    ax.plot([0.01, 0.99], [R_SUPP1[1] + 0.003, R_SUPP1[1] + 0.003],
            color='#30363D', lw=0.8, linestyle='--', zorder=2)
    ax.text(0.5, R_SUPP1[1] + 0.006, "PLATFORM SERVICES (Auth · Admin · Bulk · Email Ingest)",
            ha='center', fontsize=6.5, color='#484F58', fontfamily=FONT)

    # ── Legend ─────────────────────────────────────────────────────────────
    legend = [
        (C_INGEST,   "Event Ingestion :3151"),
        (C_ENGINE,   "Engine :3152"),
        (C_TEMPLATE, "Template :3153"),
        (C_ROUTER,   "Channel Router :3154"),
        (C_ADAPTER,  "Provider Adapters :3171-3174"),
        (C_AUDIT,    "Audit :3156"),
        (C_MQ,       "RabbitMQ"),
        (C_AUTH,     "Auth / UI"),
    ]
    lx0, ly = 0.01, R_LEGEND[0] + 0.004
    cw = 0.122
    for j, (col, lbl) in enumerate(legend):
        lx = lx0 + j * cw
        dot = FancyBboxPatch((lx, ly + 0.003), 0.011, 0.011,
            boxstyle="round,pad=0,rounding_size=0.002",
            linewidth=0, facecolor=col, zorder=8)
        ax.add_patch(dot)
        ax.text(lx + 0.015, ly + 0.008, lbl, va='center',
                fontsize=6.5, color='#8B949E', fontfamily=FONT)

    # ── Footer ─────────────────────────────────────────────────────────────
    ax.text(0.99, R_LEGEND[0] + 0.008, "Notification API  ·  Architecture Team  ·  2026-03-02",
            ha='right', fontsize=7, color='#3D4450', fontfamily=FONT)

    plt.tight_layout(pad=0)
    out = "docs/High-Level Architecture.jpg"
    fig.savefig(out, dpi=160, bbox_inches='tight',
                facecolor=BG, edgecolor='none', format='jpeg')
    plt.close(fig)
    print(f"Saved: {out}")


# ═════════════════════════════════════════════════════════════════════════════
# DIAGRAM 2 — EVENT FLOW (END-TO-END)
# ═════════════════════════════════════════════════════════════════════════════
def make_flow():
    W, H = 20, 26
    fig, ax = plt.subplots(figsize=(W, H))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    # ── Title ─────────────────────────────────────────────────────────────
    ax.text(0.5, 0.986, "Notification API — Event Flow (End-to-End)",
            ha='center', va='center', fontsize=18, fontweight='bold',
            color='white', fontfamily=FONT)
    ax.text(0.5, 0.978, "22-step lifecycle from source system to end customer and back",
            ha='center', va='center', fontsize=9.5, color='#8B949E', fontfamily=FONT)

    # ── Swimlane setup ─────────────────────────────────────────────────────
    # 6 columns, evenly spaced
    lane_keys   = ["Source", "Ingestion", "Engine", "Template", "Router", "Adapter"]
    lane_colors = [C_SOURCE, C_INGEST, C_ENGINE, C_TEMPLATE, C_ROUTER, C_ADAPTER]
    lane_labels = [
        "Source\nSystems",
        "event-ingestion\n:3151",
        "notification-engine\n:3152",
        "template-service\n:3153",
        "channel-router\n:3154",
        "adapter-*\n:3171–3174",
    ]
    n = len(lane_keys)
    margin_l, margin_r = 0.04, 0.04
    lane_w = (1 - margin_l - margin_r) / n
    lane_centers = [margin_l + (i + 0.5) * lane_w for i in range(n)]
    lane_map = dict(zip(lane_keys, lane_centers))
    color_map = dict(zip(lane_keys, lane_colors))

    header_top    = 0.970
    header_bottom = 0.945
    content_top   = 0.935
    content_bot   = 0.020
    step_area     = content_top - content_bot
    N_STEPS = 22
    step_h = step_area / (N_STEPS + 1)

    def step_y(n): return content_top - n * step_h  # y center for step n

    # Draw swimlane backgrounds (alternating very subtle)
    for i in range(n):
        shade = "#FFFFFF08" if i % 2 == 0 else "#00000000"
        rect = plt.Rectangle((margin_l + i * lane_w, content_bot),
                              lane_w, content_top - content_bot,
                              facecolor=shade, linewidth=0, zorder=0)
        ax.add_patch(rect)
        # vertical dashed center line
        ax.plot([lane_centers[i], lane_centers[i]],
                [content_bot, content_top],
                color=lane_colors[i] + "22", lw=1, linestyle='--', zorder=1)

    # Draw lane headers
    for i, (lbl, col) in enumerate(zip(lane_labels, lane_colors)):
        lx = margin_l + i * lane_w
        hdr = FancyBboxPatch((lx + 0.003, header_bottom),
                             lane_w - 0.006, header_top - header_bottom,
                             boxstyle="round,pad=0,rounding_size=0.006",
                             linewidth=1.5, edgecolor=col,
                             facecolor=col + "22", zorder=3)
        ax.add_patch(hdr)
        ax.text(lane_centers[i], (header_top + header_bottom) / 2, lbl,
                ha='center', va='center', fontsize=8, fontweight='bold',
                color=col, fontfamily=FONT, zorder=4)

    # ── Phase background bands ─────────────────────────────────────────────
    phases = [
        # label,               y_top,         y_bot,         color
        ("INGESTION PHASE",    step_y(0.5),   step_y(3.5),   C_INGEST),
        ("ENGINE PHASE",       step_y(3.5),   step_y(9.5),   C_ENGINE),
        ("ROUTING PHASE",      step_y(9.5),   step_y(12.5),  C_ROUTER),
        ("DELIVERY PHASE",     step_y(12.5),  step_y(16.5),  C_ADAPTER),
        ("WEBHOOK RETURN",     step_y(16.5),  step_y(22.5),  C_MQ),
    ]
    for plbl, yt, yb, pc in phases:
        band = plt.Rectangle((0, yb), 1.0, yt - yb,
                              facecolor=pc + "0C", linewidth=0, zorder=0)
        ax.add_patch(band)
        # phase label on right margin
        ax.text(0.985, (yt + yb) / 2, plbl,
                ha='right', va='center', fontsize=7.5, fontweight='bold',
                color=pc + "88", fontfamily=FONT, rotation=90, zorder=2)

    # ── Step box helper ────────────────────────────────────────────────────
    BOX_W = lane_w * 0.78
    BOX_H = step_h * 0.62

    def self_box(lane, step_n, label, color, is_mq=False):
        cx = lane_map[lane]
        cy = step_y(step_n)
        x = cx - BOX_W / 2
        y = cy - BOX_H / 2
        rect = FancyBboxPatch((x, y), BOX_W, BOX_H,
            boxstyle="round,pad=0,rounding_size=0.005",
            linewidth=1.2, edgecolor=color,
            facecolor=color + ("28" if is_mq else "18"), zorder=4)
        ax.add_patch(rect)
        ax.text(cx, cy, label, ha='center', va='center',
                fontsize=7.5, color='white' if not is_mq else color,
                fontfamily=FONT, fontweight='bold' if is_mq else 'normal',
                zorder=5, multialignment='center')
        # step badge
        bx = x + 0.010
        by = y + BOX_H - 0.009
        bc = plt.Circle((bx, by), 0.011, color=color, zorder=6)
        ax.add_patch(bc)
        ax.text(bx, by, str(step_n), ha='center', va='center',
                fontsize=5.5, color='white', fontfamily=FONT,
                fontweight='bold', zorder=7)

    def cross_box(from_lane, to_lane, step_n, label, color, is_mq=False):
        x1 = lane_map[from_lane]
        x2 = lane_map[to_lane]
        cy = step_y(step_n)
        # draw horizontal arrow
        dir_ = 1 if x2 > x1 else -1
        ax.annotate("", xy=(x2 - dir_ * BOX_W / 2, cy),
                    xytext=(x1 + dir_ * BOX_W / 2, cy),
                    arrowprops=dict(arrowstyle="-|>", color=color, lw=1.8,
                                    mutation_scale=11,
                                    shrinkA=2, shrinkB=2), zorder=5)
        # label bubble
        mx = (x1 + x2) / 2
        bw = abs(x2 - x1) * 0.72
        bh = BOX_H * 0.90
        brect = FancyBboxPatch((mx - bw/2, cy - bh/2), bw, bh,
            boxstyle="round,pad=0,rounding_size=0.006",
            linewidth=1.2, edgecolor=color,
            facecolor=BG, zorder=6)
        ax.add_patch(brect)
        if is_mq:
            ax.text(mx, cy + 0.007, label, ha='center', va='center',
                    fontsize=7, color=color, fontfamily=FONT,
                    fontweight='bold', zorder=7)
            ax.text(mx, cy - 0.008, "RabbitMQ", ha='center', va='center',
                    fontsize=6, color=color + "BB", fontfamily=FONT,
                    style='italic', zorder=7)
        else:
            ax.text(mx, cy, label, ha='center', va='center',
                    fontsize=7, color='white', fontfamily=FONT, zorder=7,
                    multialignment='center')
        # badge on origin side
        bx = x1 + dir_ * BOX_W / 2 + dir_ * 0.008
        bc = plt.Circle((bx, cy + BOX_H * 0.38), 0.012, color=color, zorder=8)
        ax.add_patch(bc)
        ax.text(bx, cy + BOX_H * 0.38, str(step_n), ha='center', va='center',
                fontsize=6, color='white', fontfamily=FONT,
                fontweight='bold', zorder=9)

    # ── Vertical connector lines between steps ─────────────────────────────
    # Map: step → (lane, color)
    step_info = {
        1:  ("Source",    C_SOURCE),
        2:  ("Ingestion", C_INGEST),
        3:  ("Ingestion", C_INGEST),
        4:  ("Ingestion", C_MQ),       # cross: Ingestion→Engine
        5:  ("Engine",    C_ENGINE),
        6:  ("Engine",    C_ENGINE),
        7:  ("Engine",    C_ENGINE),
        8:  ("Engine",    C_TEMPLATE),  # cross: Engine→Template
        9:  ("Template",  C_TEMPLATE),  # cross back: Template→Engine
        10: ("Engine",    C_MQ),        # cross: Engine→Router
        11: ("Router",    C_ROUTER),
        12: ("Router",    C_ROUTER),
        13: ("Router",    C_ADAPTER),   # cross: Router→Adapter
        14: ("Adapter",   C_ADAPTER),
        15: ("Adapter",   C_ADAPTER),
        16: ("Adapter",   C_ADAPTER),
        17: ("Adapter",   C_ADAPTER),
        18: ("Adapter",   C_ADAPTER),
        19: ("Adapter",   C_ADAPTER),
        20: ("Adapter",   C_MQ),        # cross back: Adapter→Engine
        21: ("Engine",    C_ENGINE),
        22: ("Engine",    C_AUDIT),
    }

    # draw connecting lines
    for s in range(1, N_STEPS):
        lane_curr, col_curr = step_info[s]
        lane_next, col_next = step_info[s + 1]
        y_top = step_y(s) - BOX_H / 2
        y_bot = step_y(s + 1) + BOX_H / 2
        if lane_curr == lane_next:
            ax.plot([lane_map[lane_curr], lane_map[lane_curr]],
                    [y_top, y_bot],
                    color=col_curr + "66", lw=1.2, zorder=2)
        else:
            # elbow line
            cx_curr = lane_map[lane_curr]
            cx_next = lane_map[lane_next]
            mid_y = (y_top + y_bot) / 2
            ax.plot([cx_curr, cx_curr], [y_top, mid_y],
                    color=col_curr + "55", lw=1.0, linestyle=':', zorder=2)
            ax.plot([cx_curr, cx_next], [mid_y, mid_y],
                    color=col_next + "55", lw=1.0, linestyle=':', zorder=2)
            ax.plot([cx_next, cx_next], [mid_y, y_bot],
                    color=col_next + "55", lw=1.0, linestyle=':', zorder=2)

    # ── Draw all steps ─────────────────────────────────────────────────────
    self_box("Source",    1,  "Publish event\n(AMQP / Webhook / SMTP)",     C_SOURCE)
    self_box("Ingestion", 2,  "Normalize payload\nusing field mappings",     C_INGEST)
    self_box("Ingestion", 3,  "Assign priority\nnormal / critical",          C_INGEST)
    cross_box("Ingestion","Engine", 4, "xch.events.normalized",              C_MQ,      is_mq=True)
    self_box("Engine",    5,  "Evaluate\nnotification rules",                C_ENGINE)
    self_box("Engine",    6,  "Resolve\nrecipients",                         C_ENGINE)
    self_box("Engine",    7,  "Apply suppressions\n& overrides",             C_ENGINE)
    cross_box("Engine","Template", 8, "POST /render  (HTTP)",                C_TEMPLATE)
    cross_box("Template","Engine", 9, "Return rendered content",             C_TEMPLATE)
    cross_box("Engine","Router",  10, "xch.notifications.deliver",           C_MQ,      is_mq=True)
    self_box("Router",   11,  "Consume from\ntiered queue",                  C_ROUTER)
    self_box("Router",   12,  "Resolve adapter URL\nfrom provider_configs",  C_ROUTER)
    cross_box("Router","Adapter", 13, "POST /send  (HTTP)",                  C_ADAPTER)
    self_box("Adapter",  14,  "Translate to\nprovider API format",           C_ADAPTER)
    self_box("Adapter",  15,  "Call external\nprovider API",                 C_ADAPTER)
    self_box("Adapter",  16,  "Deliver to\nend customer  ✓",                 C_SOURCE)
    self_box("Adapter",  17,  "Receive webhook\ncallback from provider",     C_ADAPTER)
    self_box("Adapter",  18,  "Verify provider\nsignature",                  C_ADAPTER)
    self_box("Adapter",  19,  "Normalize\nstatus event",                     C_ADAPTER)
    cross_box("Adapter","Engine", 20, "xch.notifications.status",            C_MQ,      is_mq=True)
    self_box("Engine",   21,  "Update notification\nlifecycle state",        C_ENGINE)
    self_box("Engine",   22,  "Record delivery\nreceipt → Audit",            C_AUDIT)

    # ── Footer ────────────────────────────────────────────────────────────
    ax.text(0.5, 0.010, "Notification API  ·  Architecture Team  ·  2026-03-02",
            ha='center', fontsize=8, color='#3D4450', fontfamily=FONT)

    plt.tight_layout(pad=0)
    out = "docs/Event Flow (End-to-End).jpg"
    fig.savefig(out, dpi=160, bbox_inches='tight',
                facecolor=BG, edgecolor='none', format='jpeg')
    plt.close(fig)
    print(f"Saved: {out}")


if __name__ == "__main__":
    make_hla()
    make_flow()
    print("Done.")
