// --- Declarative UI Engine for Mid's Manuscript Menagerie ---
// Built using NovelAI Theme Tokens, native IconIds, and isolated Web Worker-safe UI parts

const PANEL_ID = "mids-manuscript-menagerie-panel";

// Panel update coordination & anti-flicker lock
let isPanelUpdateInProgress = false;
let hasPendingPanelUpdate = false;
let searchRefreshSeq = 0;
const LOREBOOK_RESULTS_ID = "mm-lorebook-results";
// Muted caption color (textDescription is not a NovelAI theme token)
const MUTED_TEXT = 'textDisabled';

// --- Theme Tokens & Reusable Style Presets ---

const CARD_STYLE: Record<string, string> = {
    backgroundColor: 'bg1',
    border: '1px solid bg2',
    borderRadius: '6px',
    padding: '10px',
    margin: '6px 0'
};

const ACCENT_CARD_STYLE: Record<string, string> = {
    ...CARD_STYLE,
    borderColor: 'textMain',
    backgroundColor: 'bg2'
};

const METRIC_BOX_STYLE: Record<string, string> = {
    backgroundColor: 'bg0',
    border: '1px solid bg2',
    borderRadius: '4px',
    padding: '8px',
    margin: '4px',
    textAlign: 'center',
    flex: '1'
};

const SELECTABLE_TEXT_BOX_STYLE: Record<string, string> = {
    backgroundColor: 'bg0',
    border: '1px solid bg2',
    borderRadius: '4px',
    padding: '10px',
    margin: '8px 0',
    userSelect: 'text',
    cursor: 'text'
};

const ROW_CATEGORY_STYLE: Record<string, string> = {
    backgroundColor: 'bg0',
    border: '1px solid bg2',
    borderRadius: '4px',
    padding: '4px 8px',
    margin: '3px 0 1px 0'
};

const ENTRY_ROW_BASE: Record<string, string> = {
    padding: '3px 6px',
    margin: '1px 0 1px 16px',
    borderRadius: '4px'
};

const BTN_ENTRY_ACTIVE: Record<string, string> = {
    fontSize: '0.7em',
    padding: '2px 5px',
    margin: '1px',
    backgroundColor: 'bg3',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'textHeadings',
    border: '1px solid var(--theme-textHeadings)',
    color: 'textHeadings',
    fontWeight: 'bold'
};

const BTN_ENTRY_INACTIVE: Record<string, string> = {
    fontSize: '0.7em',
    padding: '2px 5px',
    margin: '1px',
    backgroundColor: 'bg2',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'bg3',
    border: '1px solid var(--theme-bg3)',
    color: 'textMain'
};

// --- UI Part Factory Functions ---

// noTemplate defaults to true so {{...}} in manuscript/AI text renders literally instead of as a storage lookup
function makeText(
    text: string,
    markdown = true,
    overrideStyle: Record<string, string> = {},
    noTemplate = true
): any {
    return {
        type: 'text' as const,
        text,
        markdown,
        noTemplate,
        style: {
            color: 'textMain',
            ...overrideStyle
        }
    } as any;
}

function makeHeading(
    text: string,
    level: 1 | 2 | 3 | 4 = 2,
    overrideStyle: Record<string, string> = {}
): any {
    const fontSizes: Record<number, string> = {
        1: '1.75rem',    // 2.0  * 0.875rem = 28px   (H1)
        2: '1.3125rem',  // 1.5  * 0.875rem = 21px   (H2)
        3: '1.024rem',   // 1.17 * 0.875rem = 16.4px (H3)
        4: '0.875rem'    // 1.0  * 0.875rem = 14px   (H4)
    };

    return {
        type: 'text' as const,
        text,
        markdown: false,
        noTemplate: true,
        style: {
            fontFamily: 'headings',
            fontSize: fontSizes[level] || '1.25em',
            fontWeight: '600',
            color: 'textHeadings',
            letterSpacing: '0.5px',
            margin: '0',
            padding: '0',
            ...overrideStyle
        }
    } as any;
}

function makeButton(
    text: string,
    onClick: () => Promise<void> | void,
    options: {
        id?: string;
        disabled?: boolean;
        primary?: boolean;
        iconId?: IconId;
        disableWhileRunning?: boolean;
        overrideStyle?: Record<string, string>;
    } = {}
): any {
    const part: any = {
        type: 'button' as const,
        text,
        disabled: !!options.disabled,
        disabledWhileCallbackRunning: !!options.disableWhileRunning,
        callback: onClick,
        style: {
            backgroundColor: options.primary ? 'bg3' : (options.disabled ? 'bg0' : 'bg2'),
            color: options.primary ? 'textHeadings' : (options.disabled ? 'textDisabled' : 'textMain'),
            margin: '4px',
            padding: '6px 12px',
            borderRadius: '4px',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: options.primary ? 'textHeadings' : (options.disabled ? 'bg2' : 'bg3'),
            border: options.primary ? '1px solid var(--theme-textHeadings)' : (options.disabled ? '1px solid var(--theme-bg2)' : '1px solid var(--theme-bg3)'),
            fontWeight: options.primary ? 'bold' : 'normal',
            cursor: options.disabled ? 'not-allowed' : 'pointer',
            opacity: options.disabled ? '0.5' : '1.0',
            ...options.overrideStyle
        }
    };
    if (options.id) {
        part.id = options.id;
    }
    if (options.iconId) {
        part.iconId = options.iconId;
    }
    return part;
}

function makeToggleButton(
    label: string,
    value: boolean,
    onToggle: () => Promise<void> | void,
    disabled = false
): any {
    return makeButton(
        `${label} (${value ? "ON" : "OFF"})`,
        onToggle,
        {
            disabled,
            primary: value,
            iconId: value ? 'check' : 'close',
            overrideStyle: {
                backgroundColor: value ? 'bg3' : 'bg0',
                color: value ? 'textHeadings' : MUTED_TEXT,
                border: value ? '1px solid textHeadings' : '1px solid bg2',
                fontSize: '12px',
                padding: '6px 10px',
                margin: '3px 0',
                width: '100%',
                fontWeight: value ? 'bold' : 'normal',
                cursor: disabled ? 'not-allowed' : 'pointer'
            }
        }
    );
}

function makeIcon(iconId: IconId, overrideStyle: Record<string, string> = {}): any {
    return {
        type: 'button' as const,
        iconId,
        text: '',
        disabled: false,
        disabledWhileCallbackRunning: false,
        callback: () => { },
        style: {
            width: '18px',
            height: '18px',
            minWidth: '18px',
            minHeight: '18px',
            padding: '0',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            backgroundColor: 'transparent',
            color: 'textHeadings',
            margin: '0 6px 0 0',
            pointerEvents: 'none',
            cursor: 'default',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...overrideStyle
        }
    } as any;
}

interface CardTitleConfig {
    title?: string;
    text?: string;
    iconId?: IconId;
}

interface CardOptions {
    isAccent?: boolean;
    iconId?: IconId;
}

function makeCard(
    title: string | CardTitleConfig | null,
    children: any[],
    isAccentOrOptionsOrIcon: boolean | IconId | CardOptions = false,
    iconId?: IconId
): any {
    let isAccent = false;
    let cardIconId: IconId | undefined;

    if (typeof isAccentOrOptionsOrIcon === 'boolean') {
        isAccent = isAccentOrOptionsOrIcon;
        if (typeof iconId === 'string') {
            cardIconId = iconId;
        }
    } else if (typeof isAccentOrOptionsOrIcon === 'string') {
        cardIconId = isAccentOrOptionsOrIcon as IconId;
        if (typeof iconId === 'string') {
            cardIconId = iconId;
        }
    } else if (isAccentOrOptionsOrIcon && typeof isAccentOrOptionsOrIcon === 'object') {
        isAccent = !!isAccentOrOptionsOrIcon.isAccent;
        cardIconId = isAccentOrOptionsOrIcon.iconId;
    }

    let titleText: string | null = null;
    if (typeof title === 'string') {
        titleText = title;
    } else if (title && typeof title === 'object') {
        titleText = title.title ?? title.text ?? null;
        if (title.iconId && !cardIconId) {
            cardIconId = title.iconId;
        }
    }

    const content: any[] = [];
    if (titleText || cardIconId) {
        if (cardIconId) {
            const titleRow: any[] = [
                makeIcon(cardIconId, {
                    color: 'textHeadings',
                    margin: '0 6px 0 0'
                })
            ];
            if (titleText) {
                titleRow.push(makeHeading(titleText, 3, { margin: '0' }));
            }
            content.push({
                type: 'row' as const,
                alignment: 'center',
                style: {
                    margin: '0 0 6px 0',
                    alignItems: 'center',
                    justifyContent: 'flex-start'
                },
                content: titleRow
            } as any);
        } else if (titleText) {
            content.push(makeHeading(titleText, 3, { margin: '0 0 6px 0' }));
        }
    }
    content.push(...children);
    return {
        type: 'container' as const,
        style: isAccent ? ACCENT_CARD_STYLE : CARD_STYLE,
        content
    } as any;
}

function makeMetricBox(label: string, value: string | number, subtext?: string): any {
    const items: any[] = [
        makeText(label, false, { fontSize: '11px', color: MUTED_TEXT, fontWeight: 'bold', margin: '0' }),
        makeHeading(String(value), 2, { margin: '2px 0', color: 'textHeadings' })
    ];
    if (subtext) {
        items.push(makeText(subtext, false, { fontSize: '10px', color: MUTED_TEXT, margin: '0' }));
    }
    return {
        type: 'container' as const,
        style: METRIC_BOX_STYLE,
        content: items
    } as any;
}

/**
 * Two-way selector switch with animated sliding thumb and fading labels
 * Recreates the pill toggle behavior from examples/toggle.html in NovelAI
 */
function makeTwoWayToggle(
    id: string,
    leftLabel: string,
    rightLabel: string,
    isRight: boolean,
    onToggle: (selectRight: boolean) => void
): any {
    const isLeft = !isRight;

    return {
        type: 'row' as const,
        id: `two-way-row-${id}`,
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '4px 0',
            margin: '2px 0'
        },
        content: [
            // Left Label Button (clickable)
            {
                type: 'button' as const,
                id: `two-way-left-${id}`,
                text: leftLabel,
                callback: () => {
                    if (isRight) onToggle(false);
                },
                style: {
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: '4px 6px',
                    margin: '0',
                    fontSize: '0.82em',
                    color: isLeft ? 'textHeadings' : 'textDisabled',
                    fontWeight: isLeft ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'color 0.25s ease, opacity 0.25s ease',
                    opacity: isLeft ? '1.0' : '0.5'
                }
            } as any,

            // Center Sliding Pill Toggle
            {
                type: 'container' as const,
                id: `two-way-switch-wrap-${id}`,
                style: {
                    position: 'relative',
                    width: '46px',
                    height: '24px',
                    display: 'inline-block',
                    flexShrink: '0',
                    cursor: 'pointer'
                },
                content: [
                    // Track
                    {
                        type: 'container' as const,
                        id: `two-way-track-${id}`,
                        style: {
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            width: '46px',
                            height: '24px',
                            backgroundColor: 'bg3',
                            borderRadius: '12px',
                            pointerEvents: 'none'
                        },
                        content: [
                            // Sliding Thumb
                            {
                                type: 'container' as const,
                                id: `two-way-thumb-${id}`,
                                style: {
                                    position: 'absolute',
                                    top: '3px',
                                    left: '2.5px',
                                    width: '20px',
                                    height: '18px',
                                    backgroundColor: 'textMain',
                                    borderRadius: '9px',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2)',
                                    transform: isRight ? 'translateX(21px)' : 'translateX(0px)',
                                    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease',
                                    pointerEvents: 'none'
                                },
                                content: []
                            } as any
                        ]
                    } as any,

                    // Transparent Clickable Button Overlay
                    {
                        type: 'button' as const,
                        id: `two-way-btn-${id}`,
                        text: '',
                        callback: () => {
                            onToggle(!isRight);
                        },
                        style: {
                            position: 'absolute',
                            top: '0',
                            left: '0',
                            width: '46px',
                            height: '24px',
                            opacity: '0',
                            margin: '0',
                            padding: '0',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            zIndex: '2'
                        }
                    } as any
                ]
            } as any,

            // Right Label Button (clickable)
            {
                type: 'button' as const,
                id: `two-way-right-${id}`,
                text: rightLabel,
                callback: () => {
                    if (!isRight) onToggle(true);
                },
                style: {
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: '4px 6px',
                    margin: '0',
                    fontSize: '0.82em',
                    color: isRight ? 'textHeadings' : 'textDisabled',
                    fontWeight: isRight ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'color 0.25s ease, opacity 0.25s ease',
                    opacity: isRight ? '1.0' : '0.5'
                }
            } as any
        ]
    } as any;
}

// Re-renders only the Lorebook results container (search filtering), leaving the input and panel intact
async function refreshLorebookResults(): Promise<void> {
    try {
        await api.v1.ui.updateParts([{
            id: LOREBOOK_RESULTS_ID,
            content: buildLorebookResultParts(computeAllLorebookStats())
        } as any]);
    } catch (err) {
        api.v1.error("Lorebook search refresh failed:", err);
    }
}

// Sequence-token debounce: only the latest keystroke within the window triggers a refresh
function scheduleLorebookResultsRefresh(): void {
    const seq = ++searchRefreshSeq;
    api.v1.timers.sleep(150).then(() => {
        if (seq === searchRefreshSeq) refreshLorebookResults();
    }).catch((err: any) => api.v1.error("Search debounce error:", err));
}

// Builds the filtered category/entry list for the Lorebook card (search-driven region)
function buildLorebookResultParts(stats: ComputedLorebookStats): any[] {
    const parts: any[] = [];
    const query = appState.searchQuery;
    const isFiltering = query.length > 0;
    let renderedCategoryCount = 0;

    // List each category
    for (const cat of appState.availableLorebookCategories) {
        const catStats = stats.byCategory.get(cat.id);
        const analysisStats = catStats?.analysis || { selected: 0, total: 1, isAll: false, isNone: true, isPartial: false };
        const summaryStats = catStats?.summary || { selected: 0, total: 1, isAll: false, isNone: true, isPartial: false };
        const hasEntries = !!(cat.entries && cat.entries.length > 0);

        // Filter entries matching the search query
        const matchingEntries = isFiltering
            ? (cat.entries || []).filter(e => e.name.toLowerCase().includes(query) || cat.name.toLowerCase().includes(query))
            : (cat.entries || []);

        // If query is active and nothing matches this category, skip rendering
        if (isFiltering && matchingEntries.length === 0 && !cat.name.toLowerCase().includes(query)) {
            continue;
        }

        renderedCategoryCount++;
        // When filtering, auto-expand to show matching entries
        const isCollapsed = isFiltering ? false : appState.collapsedCategoryIds.has(cat.id);

        let analysisBtnLabel = "Analysis";
        if (analysisStats.isAll) {
            analysisBtnLabel = "Analysis ✓";
        } else if (analysisStats.isPartial) {
            analysisBtnLabel = `Analysis (${analysisStats.selected}/${analysisStats.total})`;
        }

        let summaryBtnLabel = "Summary";
        if (summaryStats.isAll) {
            summaryBtnLabel = "Summary ✓";
        } else if (summaryStats.isPartial) {
            summaryBtnLabel = `Summary (${summaryStats.selected}/${summaryStats.total})`;
        }

        // Category Header Row
        parts.push({
            type: 'row' as const,
            alignment: 'center',
            style: ROW_CATEGORY_STYLE,
            content: [
                // Chevron
                ...(hasEntries ? [
                    makeButton(
                        "",
                        () => {
                            toggleCategoryFold(cat.id);
                            renderPanel();
                        },
                        {
                            iconId: isCollapsed ? 'chevron-right' : 'chevron-down',
                            overrideStyle: {
                                width: '20px',
                                height: '20px',
                                padding: '0',
                                margin: '0 4px 0 0',
                                backgroundColor: 'transparent',
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                borderColor: 'transparent',
                                border: '1px solid transparent',
                                color: 'textMain',
                                cursor: 'pointer',
                                flexShrink: '0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }
                        }
                    )
                ] : [
                    {
                        type: 'container' as const,
                        style: { width: '20px', height: '20px', flexShrink: '0', margin: '0 4px 0 0' },
                        content: []
                    } as any
                ]),
                // Category folder/file icon (fixed-width, never clipped by text overflow)
                makeButton(
                    "",
                    () => {
                        if (hasEntries) {
                            toggleCategoryFold(cat.id);
                            renderPanel();
                        }
                    },
                    {
                        iconId: cat.id === '__uncategorized__' ? 'file' : 'folder',
                        overrideStyle: {
                            width: '20px',
                            height: '20px',
                            padding: '0',
                            margin: '0 2px 0 0',
                            backgroundColor: 'transparent',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'transparent',
                            border: '1px solid transparent',
                            color: (analysisStats.isAll || summaryStats.isAll || analysisStats.isPartial || summaryStats.isPartial) ? 'textHeadings' : 'textMain',
                            cursor: hasEntries ? 'pointer' : 'default',
                            flexShrink: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }
                    }
                ),
                // Category title text button (flex-1, overflow-hidden — text only, no icon)
                makeButton(
                    isFiltering && matchingEntries.length !== cat.entryCount
                        ? `${cat.name} (${matchingEntries.length}/${cat.entryCount})`
                        : `${cat.name} (${cat.entryCount})`,
                    () => {
                        if (hasEntries) {
                            toggleCategoryFold(cat.id);
                            renderPanel();
                        }
                    },
                    {
                        overrideStyle: {
                            flex: '1',
                            minWidth: '0',
                            textAlign: 'left',
                            justifyContent: 'flex-start',
                            padding: '2px 4px',
                            margin: '0',
                            backgroundColor: 'transparent',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'transparent',
                            border: '1px solid transparent',
                            color: (analysisStats.isAll || summaryStats.isAll || analysisStats.isPartial || summaryStats.isPartial) ? 'textHeadings' : 'textMain',
                            fontWeight: 'bold',
                            fontSize: '0.9em',
                            cursor: hasEntries ? 'pointer' : 'default',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }
                    }
                ),
                // Category Action Buttons
                makeButton(
                    analysisBtnLabel,
                    () => {
                        toggleLorebookCategoryInclusion(cat.id, 'analysis');
                        renderPanel();
                    },
                    {
                        primary: analysisStats.isAll,
                        overrideStyle: {
                            fontSize: '0.8em',
                            padding: '3px 7px',
                            margin: '1px',
                            backgroundColor: (analysisStats.isAll || analysisStats.isPartial) ? 'bg3' : 'bg2',
                            borderWidth: '1px',
                            borderStyle: analysisStats.isPartial ? 'dashed' : 'solid',
                            borderColor: analysisStats.isPartial ? 'textMain' : (analysisStats.isAll ? 'textHeadings' : 'bg3'),
                            border: analysisStats.isPartial ? '1px dashed var(--theme-textMain)' : (analysisStats.isAll ? '1px solid var(--theme-textHeadings)' : '1px solid var(--theme-bg3)'),
                            color: (analysisStats.isAll || analysisStats.isPartial) ? 'textHeadings' : 'textMain',
                            fontWeight: (analysisStats.isAll || analysisStats.isPartial) ? 'bold' : 'normal'
                        }
                    }
                ),
                makeButton(
                    summaryBtnLabel,
                    () => {
                        toggleLorebookCategoryInclusion(cat.id, 'summary');
                        renderPanel();
                    },
                    {
                        primary: summaryStats.isAll,
                        overrideStyle: {
                            fontSize: '0.8em',
                            padding: '3px 7px',
                            margin: '1px',
                            backgroundColor: (summaryStats.isAll || summaryStats.isPartial) ? 'bg3' : 'bg2',
                            borderWidth: '1px',
                            borderStyle: summaryStats.isPartial ? 'dashed' : 'solid',
                            borderColor: summaryStats.isPartial ? 'textMain' : (summaryStats.isAll ? 'textHeadings' : 'bg3'),
                            border: summaryStats.isPartial ? '1px dashed var(--theme-textMain)' : (summaryStats.isAll ? '1px solid var(--theme-textHeadings)' : '1px solid var(--theme-bg3)'),
                            color: (summaryStats.isAll || summaryStats.isPartial) ? 'textHeadings' : 'textMain',
                            fontWeight: (summaryStats.isAll || summaryStats.isPartial) ? 'bold' : 'normal'
                        }
                    }
                )
            ]
        } as any);

        // Indented entries under this category (rendered when expanded)
        if (hasEntries && !isCollapsed) {
            const { analysisCategoryIds, summaryCategoryIds, analysisEntryIds, summaryEntryIds } = appState.lorebookInclusion;
            const isCatAnalysis = analysisCategoryIds.has(cat.id);
            const isCatSummary = summaryCategoryIds.has(cat.id);

            for (const entry of matchingEntries) {
                const isEntryInAnalysis = isCatAnalysis || analysisEntryIds.has(entry.id);
                const isEntryInSummary = isCatSummary || summaryEntryIds.has(entry.id);
                const isAnySelected = isEntryInAnalysis || isEntryInSummary;

                parts.push({
                    type: 'row' as const,
                    alignment: 'center',
                    style: {
                        ...ENTRY_ROW_BASE,
                        backgroundColor: isAnySelected ? 'bg0' : 'transparent',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: isAnySelected ? 'bg2' : 'transparent',
                        border: isAnySelected ? '1px solid var(--theme-bg2)' : '1px solid transparent',
                        opacity: isAnySelected ? 1.0 : (entry.enabled ? 0.85 : 0.5)
                    },
                    content: [
                        makeText(
                            entry.enabled ? `• ${entry.name}` : `• ${entry.name} (disabled)`,
                            false,
                            { flex: '1', minWidth: '0', fontSize: '0.8em', color: isAnySelected ? 'textHeadings' : 'textMain', margin: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                        ),
                        makeButton(
                            isEntryInAnalysis ? "Analysis ✓" : "Analysis",
                            () => {
                                toggleLorebookEntryInclusion(entry.id, cat.id, 'analysis');
                                renderPanel();
                            },
                            {
                                primary: isEntryInAnalysis,
                                overrideStyle: isEntryInAnalysis ? BTN_ENTRY_ACTIVE : BTN_ENTRY_INACTIVE
                            }
                        ),
                        makeButton(
                            isEntryInSummary ? "Summary ✓" : "Summary",
                            () => {
                                toggleLorebookEntryInclusion(entry.id, cat.id, 'summary');
                                renderPanel();
                            },
                            {
                                primary: isEntryInSummary,
                                overrideStyle: isEntryInSummary ? BTN_ENTRY_ACTIVE : BTN_ENTRY_INACTIVE
                            }
                        )
                    ]
                } as any);
            }
        }
    }

    if (isFiltering && renderedCategoryCount === 0) {
        parts.push(
            makeText(`*No lorebook categories or entries matching "${appState.searchQuery}".*`, true, {
                fontSize: '0.85em',
                color: MUTED_TEXT,
                fontStyle: 'italic',
                margin: '8px 4px'
            })
        );
    }
    return parts;
}

function makeLorebookOverviewCard(): any {
    const cardChildren: any[] = [
        makeText("*Select story Lorebook categories to include as background canon context when generating chapter analyses and/or summaries.*", true, {
            fontSize: '0.9em',
            color: MUTED_TEXT,
            margin: '0 0 6px 0'
        }),
        // Master Toggles Row
        {
            type: 'row' as const,
            alignment: 'center',
            content: [
                makeButton(
                    `In Analyses: ${appState.lorebookInclusion.includeInAnalysis ? "ON" : "OFF"}`,
                    () => {
                        toggleLorebookMasterOption('analysis');
                        renderPanel();
                    },
                    {
                        primary: appState.lorebookInclusion.includeInAnalysis,
                        iconId: appState.lorebookInclusion.includeInAnalysis ? 'check' : 'close',
                        overrideStyle: { flex: '1', fontSize: '0.9em', padding: '5px 8px', margin: '2px' }
                    }
                ),
                makeButton(
                    `In Summaries: ${appState.lorebookInclusion.includeInSummary ? "ON" : "OFF"}`,
                    () => {
                        toggleLorebookMasterOption('summary');
                        renderPanel();
                    },
                    {
                        primary: appState.lorebookInclusion.includeInSummary,
                        iconId: appState.lorebookInclusion.includeInSummary ? 'check' : 'close',
                        overrideStyle: { flex: '1', fontSize: '0.9em', padding: '5px 8px', margin: '2px' }
                    }
                )
            ]
        } as any,
        // Context Reference Source Selector Row
        {
            type: 'container' as const,
            style: {
                backgroundColor: 'bg0',
                border: '1px solid bg2',
                borderRadius: '4px',
                padding: '6px 8px',
                margin: '4px 0 6px 0'
            },
            content: [
                makeHeading("Prompt Reference Source:", 4, {
                    margin: '0 0 4px 0'
                }),
                makeTwoWayToggle(
                    'ref-source',
                    'Cached (Script)',
                    'Lorebook Entries',
                    appState.referenceContextSource === 'lorebook',
                    (selectLorebook) => {
                        setReferenceContextSource(selectLorebook ? 'lorebook' : 'cached');
                        renderPanel();
                    }
                ),
                makeText(
                    appState.referenceContextSource === 'lorebook'
                        ? "*Prompts reference Lorebook entries; falls back to cache if not found.*"
                        : "*Prompts reference reports saved in local script memory.*",
                    true,
                    { fontSize: '0.8em', color: MUTED_TEXT, margin: '4px 0 0 0' }
                )
            ]
        } as any
    ];

    if (appState.availableLorebookCategories.length === 0) {
        cardChildren.push(
            makeText("*No Lorebook categories or entries detected in this story. Create entries in your Lorebook to include them here.*", true, {
                fontSize: '0.9em',
                color: MUTED_TEXT,
                margin: '8px 0 4px 0'
            }),
            makeButton("Scan Lorebook", async () => {
                await scanLorebookCategories();
                renderPanel();
            }, { iconId: 'refresh', disableWhileRunning: true, overrideStyle: { margin: '4px 0', width: '100%' } })
        );
    } else {
        // Compute all stats in a single fast pass
        const stats = computeAllLorebookStats();
        const overallAnalysis = stats.overallAnalysis;
        const overallSummary = stats.overallSummary;

        const allInAnalysisLabel = overallAnalysis.isAll ? "All in Analysis ✓" : "All in Analysis";
        const allInSummaryLabel = overallSummary.isAll ? "All in Summary ✓" : "All in Summary";

        // Subheader and Quick Select Tools
        cardChildren.push(
            {
                type: 'row' as const,
                alignment: 'center',
                content: [
                    makeHeading("Categories & Lorebooks:", 4, {
                        flex: '1',
                        margin: '6px 0 2px 0'
                    }),
                    makeButton("Rescan", async () => {
                        await scanLorebookCategories();
                        renderPanel();
                    }, {
                        iconId: 'refresh',
                        disableWhileRunning: true,
                        overrideStyle: { fontSize: '0.8em', padding: '2px 8px', margin: '2px' }
                    })
                ]
            } as any,
            // Live Search / Filter Input Row
            {
                type: 'row' as const,
                alignment: 'center',
                style: {
                    margin: '3px 0 5px 0',
                    alignItems: 'center',
                    gap: '4px'
                },
                content: [
                    {
                        type: 'textInput' as const,
                        placeholder: 'Search entries or categories...',
                        initialValue: appState.searchQuery,
                        onChange: (text: string) => {
                            // Only the results container is refreshed; the input itself is never rebuilt mid-typing
                            appState.searchQuery = (text || "").trim().toLowerCase();
                            scheduleLorebookResultsRefresh();
                        },
                        onSubmit: (text: string) => {
                            appState.searchQuery = (text || "").trim().toLowerCase();
                            searchRefreshSeq++;
                            refreshLorebookResults();
                        },
                        style: {
                            flex: '1',
                            fontSize: '0.82em',
                            height: '28px',
                            backgroundColor: 'bg0',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'bg2',
                            border: '1px solid var(--theme-bg2)',
                            borderRadius: '4px',
                            padding: '0 8px',
                            color: 'textHeadings'
                        }
                    } as any,
                    // Always present so its visibility never depends on a re-render while typing
                    makeButton("", () => {
                            searchRefreshSeq++;
                            appState.searchQuery = "";
                            renderPanel();
                        }, {
                            iconId: 'close',
                            overrideStyle: {
                                width: '28px',
                                height: '28px',
                                padding: '0',
                                margin: '0',
                                backgroundColor: 'bg2',
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                borderColor: 'bg3',
                                border: '1px solid var(--theme-bg3)',
                                color: 'textHeadings'
                            }
                        })
                ]
            } as any,
            // Quick Select & Bulk Expand Toolbar
            {
                type: 'row' as const,
                alignment: 'center',
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '2px',
                    margin: '2px 0 6px 0'
                },
                content: [
                    makeButton(
                        allInAnalysisLabel,
                        () => {
                            if (overallAnalysis.isAll) {
                                clearAllLorebookCategories('analysis');
                            } else {
                                selectAllLorebookCategories('analysis');
                            }
                            renderPanel();
                        },
                        {
                            primary: overallAnalysis.isAll,
                            overrideStyle: {
                                fontSize: '0.8em',
                                padding: '2px 7px',
                                margin: '1px',
                                backgroundColor: (overallAnalysis.isAll || overallAnalysis.isPartial) ? 'bg3' : 'bg2',
                                borderWidth: '1px',
                                borderStyle: overallAnalysis.isPartial ? 'dashed' : 'solid',
                                borderColor: overallAnalysis.isPartial ? 'textMain' : (overallAnalysis.isAll ? 'textHeadings' : 'bg3'),
                                border: (overallAnalysis.isAll || overallAnalysis.isPartial) ? (overallAnalysis.isPartial ? '1px dashed var(--theme-textMain)' : '1px solid var(--theme-textHeadings)') : '1px solid var(--theme-bg3)',
                                color: (overallAnalysis.isAll || overallAnalysis.isPartial) ? 'textHeadings' : 'textMain',
                                fontWeight: (overallAnalysis.isAll || overallAnalysis.isPartial) ? 'bold' : 'normal'
                            }
                        }
                    ),
                    makeButton(
                        allInSummaryLabel,
                        () => {
                            if (overallSummary.isAll) {
                                clearAllLorebookCategories('summary');
                            } else {
                                selectAllLorebookCategories('summary');
                            }
                            renderPanel();
                        },
                        {
                            primary: overallSummary.isAll,
                            overrideStyle: {
                                fontSize: '0.8em',
                                padding: '2px 7px',
                                margin: '1px',
                                backgroundColor: (overallSummary.isAll || overallSummary.isPartial) ? 'bg3' : 'bg2',
                                borderWidth: '1px',
                                borderStyle: overallSummary.isPartial ? 'dashed' : 'solid',
                                borderColor: overallSummary.isPartial ? 'textMain' : (overallSummary.isAll ? 'textHeadings' : 'bg3'),
                                border: (overallSummary.isAll || overallSummary.isPartial) ? (overallSummary.isPartial ? '1px dashed var(--theme-textMain)' : '1px solid var(--theme-textHeadings)') : '1px solid var(--theme-bg3)',
                                color: (overallSummary.isAll || overallSummary.isPartial) ? 'textHeadings' : 'textMain',
                                fontWeight: (overallSummary.isAll || overallSummary.isPartial) ? 'bold' : 'normal'
                            }
                        }
                    ),
                    makeButton(
                        "Clear All",
                        () => {
                            clearAllLorebookCategories('analysis');
                            clearAllLorebookCategories('summary');
                            renderPanel();
                        },
                        {
                            disabled: overallAnalysis.isNone && overallSummary.isNone,
                            overrideStyle: {
                                fontSize: '0.8em',
                                padding: '2px 7px',
                                margin: '1px',
                                backgroundColor: (overallAnalysis.isNone && overallSummary.isNone) ? 'bg0' : 'bg2',
                                borderWidth: '1px',
                                borderStyle: 'solid',
                                borderColor: (overallAnalysis.isNone && overallSummary.isNone) ? 'bg2' : 'bg3',
                                border: (overallAnalysis.isNone && overallSummary.isNone) ? '1px solid var(--theme-bg2)' : '1px solid var(--theme-bg3)',
                                color: (overallAnalysis.isNone && overallSummary.isNone) ? 'textDisabled' : 'textMain',
                                opacity: (overallAnalysis.isNone && overallSummary.isNone) ? '0.5' : '1.0',
                                cursor: (overallAnalysis.isNone && overallSummary.isNone) ? 'not-allowed' : 'pointer'
                            }
                        }
                    ),
                    makeText("•", true, { fontSize: '0.8em', color: 'textDisabled', margin: '0 2px' }),
                    makeButton("Expand All", () => {
                        expandAllCategories();
                        renderPanel();
                    }, { overrideStyle: { fontSize: '0.78em', padding: '2px 6px', margin: '1px', backgroundColor: 'bg2', borderWidth: '1px', borderStyle: 'solid', borderColor: 'bg3', border: '1px solid var(--theme-bg3)', color: 'textMain' } }),
                    makeButton("Collapse", () => {
                        collapseAllCategories();
                        renderPanel();
                    }, { overrideStyle: { fontSize: '0.78em', padding: '2px 6px', margin: '1px', backgroundColor: 'bg2', borderWidth: '1px', borderStyle: 'solid', borderColor: 'bg3', border: '1px solid var(--theme-bg3)', color: 'textMain' } })
                ]
            } as any
        );

        // Category / entry list lives in its own id-tagged container so search can refresh it alone
        cardChildren.push({
            type: 'container' as const,
            id: LOREBOOK_RESULTS_ID,
            content: buildLorebookResultParts(stats)
        } as any);

        // Active selection summary with proper high-contrast theme token
        const summarySummaryText = (stats.totalAnalysisEntries === 0 && stats.totalSummaryEntries === 0)
            ? "*Active Context: No lorebook entries currently selected.*"
            : `*Active Context: ${stats.activeAnalysisCats} category(ies) (${stats.totalAnalysisEntries} entries) in Analysis • ${stats.activeSummaryCats} category(ies) (${stats.totalSummaryEntries} entries) in Summary*`;

        cardChildren.push(
            makeText(
                summarySummaryText,
                true,
                { fontSize: '0.8em', color: 'textMain', margin: '6px 0 2px 0' }
            )
        );
    }

    return makeCard("Lorebook Reference Context", cardChildren);
}

// ---------------------------------------------------------------------------
// --- Shared Report UI Factories (Analysis + Summary) ---
// ---------------------------------------------------------------------------

/** Descriptions shown under the Prior Chapter Context button row. */
const PRIOR_CHAPTERS_DESCRIPTIONS: Record<PriorChaptersMode, Record<'analysis' | 'summary', string>> = {
    off:    { analysis: '*No prior chapter context injected.*',             summary: '*No prior chapter summaries injected.*' },
    last_1: { analysis: '*Injects Chapter N-1 summary to track arcs and immediate tensions.*', summary: '*Injects Chapter N-1 summary for immediate continuity.*' },
    last_4: { analysis: '*Injects up to 4 preceding summaries to evaluate multi-chapter development.*', summary: '*Injects up to 4 preceding chapter summaries.*' },
    all:    { analysis: '*Injects all preceding chapter summaries for full-manuscript continuity.*', summary: '*Injects all preceding chapter summaries.*' }
};

/**
 * Renders the shared "Prior Chapter Context" selector block.
 * @param mode     - Current toggle value ('off' | 'last_1' | 'last_4' | 'all')
 * @param panel    - Which panel this belongs to, used for description lookup
 * @param setter   - Async function called with the new mode on button click
 */
function makePriorChapterContextSelector(
    mode: PriorChaptersMode,
    panel: 'analysis' | 'summary',
    setter: (m: PriorChaptersMode) => Promise<void>
): any {
    return {
        type: 'container' as const,
        style: {
            backgroundColor: 'bg0',
            border: '1px solid bg2',
            borderRadius: '4px',
            padding: '6px 8px',
            margin: '4px 0 6px 0'
        },
        content: [
            makeText("**Prior Chapter Context:**", true, {
                fontSize: '11px',
                color: 'textHeadings',
                margin: '0 0 4px 0'
            }),
            {
                type: 'row' as const,
                alignment: 'center',
                content: (['off', 'last_1', 'last_4', 'all'] as PriorChaptersMode[]).map(key => {
                    const labels: Record<PriorChaptersMode, string> = { off: 'Off', last_1: 'Last 1', last_4: 'Last 4', all: 'All Prior' };
                    return makeButton(
                        labels[key],
                        () => { setter(key); renderPanel(); },
                        {
                            disabled: appState.isGenerating,
                            primary: mode === key,
                            overrideStyle: {
                                flex: '1',
                                fontSize: '10px',
                                padding: '4px 6px',
                                margin: '1px',
                                fontWeight: mode === key ? 'bold' : 'normal'
                            }
                        }
                    );
                })
            } as any,
            makeText(
                PRIOR_CHAPTERS_DESCRIPTIONS[mode][panel],
                true,
                { fontSize: '10px', color: MUTED_TEXT, margin: '4px 0 0 0' }
            )
        ]
    } as any;
}

// Small, low-contrast icon button for the chunk header corner
function makeChunkIconButton(iconId: IconId, onClick: () => void): any {
    return makeButton("", onClick, {
        iconId,
        overrideStyle: {
            width: '22px',
            height: '22px',
            minWidth: '22px',
            padding: '0',
            margin: '0 0 0 2px',
            backgroundColor: 'transparent',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'transparent',
            border: '1px solid transparent',
            color: 'textMain',
            opacity: '0.55',
            flexShrink: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }
    });
}

function makePromptChunkSection(chunk: PromptChunkView, isFirst: boolean): any {
    const isEditing = appState.editingPromptChunks.has(chunk.key);

    const headerRow: any[] = [
        makeText(chunk.isEdited ? `${chunk.label}  ·  edited` : chunk.label, false, {
            flex: '1',
            minWidth: '0',
            fontSize: '10px',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: chunk.isEdited ? 'textHeadings' : MUTED_TEXT,
            margin: '0'
        })
    ];
    // Reset only surfaces while editing, so it never competes with the pencil at rest
    if (isEditing) {
        headerRow.push(makeChunkIconButton('reload', () => { resetPromptChunk(chunk.key); renderPanel(); }));
    }
    headerRow.push(makeChunkIconButton(isEditing ? 'check' : 'edit', () => { togglePromptChunkEditing(chunk.key); renderPanel(); }));

    const lineCount = chunk.text.split("\n").length;
    const body = isEditing
        ? {
            type: 'multilineTextInput' as const,
            // Revision suffix forces a fresh textarea after reset so initialValue is re-applied
            id: `mm-chunk-input-${chunk.key}-${appState.promptChunkRevisions[chunk.key] || 0}`,
            initialValue: chunk.text,
            onChange: (text: string) => setPromptChunkOverride(chunk.key, text ?? ""),
            style: {
                width: '100%',
                height: `${Math.min(Math.max(lineCount * 16 + 24, 80), 360)}px`,
                fontSize: '11px',
                backgroundColor: 'bg1',
                border: '1px solid var(--theme-bg3)',
                borderRadius: '4px',
                padding: '6px',
                color: 'textMain'
            }
        } as any
        : makeText(chunk.text, false, {
            userSelect: 'text',
            cursor: 'text',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            margin: '0'
        });

    return {
        type: 'container' as const,
        style: {
            padding: isFirst ? '0 0 8px 0' : '8px 0',
            borderTop: isFirst ? 'none' : '1px dashed var(--theme-bg3)'
        },
        content: [
            { type: 'row' as const, alignment: 'center', style: { margin: '0 0 4px 0', alignItems: 'center' }, content: headerRow } as any,
            body
        ]
    } as any;
}

/**
 * Renders the prompt preview box (shown when appState.showPromptPreview is true),
 * split into per-chunk sections that can each be edited in place.
 */
function makePromptPreviewBlock(chunks: PromptChunkView[]): any {
    return {
        type: 'container' as const,
        style: SELECTABLE_TEXT_BOX_STYLE,
        content: chunks.map((chunk, i) => makePromptChunkSection(chunk, i === 0))
    } as any;
}

interface PromptOptionsCardConfig {
    panel: 'analysis' | 'summary';
    cardTitle: string;
    descriptionText: string;
    priorMode: PriorChaptersMode;
    priorSetter: (m: PriorChaptersMode) => Promise<void>;
    /** Extra toggle buttons inserted between the prior-context block and the note */
    extraToggles: any[];
    noteText: string;
    previewChunks: PromptChunkView[];
}

/**
 * Builds the full "Prompt Options" card that appears at the top of the Analysis and Summary tabs.
 * Contains: description label, Prior Chapter Context selector, any extra toggle buttons,
 * an always-active note, and the Preview Instruction Block toggle (+ preview box).
 */
function makePromptOptionsCard(cfg: PromptOptionsCardConfig): any {
    const children: any[] = [
        makeText(cfg.descriptionText, true, {
            fontSize: '11px',
            color: MUTED_TEXT,
            margin: '0 0 6px 0'
        }),
        makePriorChapterContextSelector(cfg.priorMode, cfg.panel, cfg.priorSetter),
        ...cfg.extraToggles,
        makeText(cfg.noteText, true, {
            fontSize: '10px',
            color: MUTED_TEXT,
            margin: '4px 0 6px 0'
        }),
        makeButton(
            appState.showPromptPreview ? "Hide Instruction Block" : "Preview Instruction Block",
            () => { togglePromptPreview(); renderPanel(); },
            {
                iconId: appState.showPromptPreview ? 'eye-off' : 'eye',
                overrideStyle: { margin: '4px 0', fontSize: '11px', width: '100%' }
            }
        )
    ];
    if (appState.showPromptPreview) {
        children.push(makePromptFileRow(cfg.panel), makePromptPreviewBlock(cfg.previewChunks));
    }
    return makeCard(cfg.cardTitle, children);
}

// Preset row shown inside the expanded instruction-block dropdown:
// [ preset name (click to rename) ][ export ][ import ][ reset to default ]
function makePromptFileRow(panel: PromptPage): any {
    const preset = appState.promptPresets[panel];
    const hasEdits = pageHasPromptEdits(panel);
    const presetLabel = preset
        ? `${preset.name || "Untitled preset"}${preset.modified ? "  ·  modified" : ""}`
        : (hasEdits ? "Custom (unnamed)" : "Default");
    const isAtDefault = !hasEdits && !preset;
    const isNamed = !!preset?.name;

    const iconButtonStyle: Record<string, string> = {
        width: '28px',
        height: '28px',
        minWidth: '28px',
        padding: '0',
        margin: '2px',
        flexShrink: '0',
        justifyContent: 'center'
    };

    return {
        type: 'row' as const,
        alignment: 'center',
        style: { margin: '4px 0', alignItems: 'center' },
        content: [
            makeButton(presetLabel, async () => renamePromptPresetAction(panel), {
                iconId: 'edit',
                disableWhileRunning: true,
                overrideStyle: {
                    flex: '1',
                    minWidth: '0',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '11px',
                    fontWeight: isNamed ? 'bold' : 'normal',
                    color: isNamed && !preset?.modified ? 'textHeadings' : MUTED_TEXT,
                    padding: '5px 8px',
                    margin: '2px'
                }
            }),
            makeButton("", async () => exportPromptsAction(panel), {
                iconId: 'download',
                disableWhileRunning: true,
                overrideStyle: iconButtonStyle
            }),
            makeButton("", async () => importPromptsAction(panel), {
                iconId: 'upload',
                disabled: appState.isGenerating,
                disableWhileRunning: true,
                overrideStyle: iconButtonStyle
            }),
            // Nothing to reset when the page is already plain defaults
            makeButton("", async () => resetPromptPageAction(panel), {
                iconId: 'reload',
                disabled: appState.isGenerating || isAtDefault,
                disableWhileRunning: true,
                overrideStyle: { ...iconButtonStyle, opacity: isAtDefault ? '0.4' : '1' }
            })
        ]
    } as any;
}

interface ReportDisplayCardConfig {
    panel: 'analysis' | 'summary';
    chapterIndex: number;
    titleDisplay: string;
    /** The stored report object (null/undefined if not yet generated) */
    report: { text: string; truncated?: boolean; suspectedTruncated?: boolean; usedAnalysis?: boolean; savedToLorebook?: boolean } | null | undefined;
    /** Card title prefix, e.g. "Developmental Analysis" or "Chapter Summary" */
    cardTitlePrefix: string;
    /** Label for the empty-state card and run button */
    emptyStateText: string;
    emptyStateButtonLabel: string;
    emptyStateIconId: IconId;
    /** Callbacks */
    onRun: () => Promise<void>;
    onCopy: () => Promise<void>;
    onAddToLorebook: () => Promise<void>;
    onContinue: () => Promise<void>;
    onRerun: () => Promise<void>;
    onClear: () => Promise<void>;
    /** Label for the re-run button (e.g. "Re-analyze" or "Re-summarize") */
    rerunLabel: string;
    rerunIconId: IconId;
    /** generatingAction values that map to this panel */
    continueActionKey: string;
    cooldownStorageKey: string;
    /** Optional badges row (e.g. "Linked with Developmental Analysis") */
    badges?: string[];
}

/**
 * Builds the full conditional report card for the Analysis or Summary tab.
 * Handles the empty-state, action row, selectable text box, and truncation warning
 * with cooldown countdown — all shared logic that was previously copy-pasted.
 */
function makeReportDisplayCard(cfg: ReportDisplayCardConfig): any {
    const { report, chapterIndex, titleDisplay, cardTitlePrefix } = cfg;

    if (!report) {
        return makeCard(`${cardTitlePrefix}: ${titleDisplay}`, [
            makeText(cfg.emptyStateText),
            makeButton(cfg.emptyStateButtonLabel, cfg.onRun, {
                primary: true,
                disabled: appState.isGenerating,
                iconId: cfg.emptyStateIconId
            })
        ]);
    }

    const isThisGenerating = appState.isGenerating && appState.generatingChapterIndex === chapterIndex;
    const isCutOff = !!(report.truncated || report.suspectedTruncated || isResponseLikelyCutOff(report.text));

    const actionRowButtons: any[] = [
        makeButton("Copy", cfg.onCopy, { iconId: 'copy', overrideStyle: { fontSize: '11px', padding: '5px 8px', margin: '2px' } }),
        makeButton("Add to Lorebook", cfg.onAddToLorebook, { iconId: 'book', overrideStyle: { fontSize: '11px', padding: '5px 8px', margin: '2px' } }),
        makeButton(cfg.rerunLabel, cfg.onRerun, { disabled: appState.isGenerating, iconId: cfg.rerunIconId, overrideStyle: { fontSize: '11px', padding: '5px 8px', margin: '2px' } }),
        makeButton("Clear", cfg.onClear, { iconId: 'trash', overrideStyle: { fontSize: '11px', padding: '5px 8px', margin: '2px' } })
    ];

    const cardElements: any[] = [
        ...(cfg.badges && cfg.badges.length > 0
            ? [makeText(`*${cfg.badges.join("  •  ")}*`, true, { fontSize: '11px', color: 'textMain', margin: '0 0 6px 0' })]
            : []),
        { type: 'row' as const, alignment: 'center', wrap: true, content: actionRowButtons } as any,
        {
            type: 'container' as const,
            style: SELECTABLE_TEXT_BOX_STYLE,
            content: [makeText(formatReportForDisplay(report.text), true, { userSelect: 'text', cursor: 'text' })]
        } as any
    ];

    if (isCutOff) {
        const remainingMs = getReplenishCooldown(cfg.cooldownStorageKey);
        const isCoolingDown = remainingMs > 0;
        const remainingSec = Math.ceil(remainingMs / 1000);

        const warningText = isCoolingDown
            ? `⚠️ *Output was cut short. Tokens are replenishing (${remainingSec}s remaining)...*`
            : report.truncated
                ? `⚠️ *Output was cut short at the token limit.*`
                : `⚠️ *Output appears to have been cut short mid-sentence or section.*`;

        const continueLabel = isThisGenerating && appState.generatingAction === cfg.continueActionKey
            ? "Continuing Generation..."
            : isCoolingDown
                ? `Continue Generation (${remainingSec}s)`
                : "Continue Generation";

        cardElements.push(
            makeText(warningText, true, { fontSize: '11px', color: 'warning', margin: '8px 0 4px 0' }),
            makeButton(continueLabel, cfg.onContinue, {
                primary: !isCoolingDown,
                disabled: appState.isGenerating || isCoolingDown,
                iconId: 'chevron-right',
                overrideStyle: { margin: '0 0 4px 0', width: '100%', opacity: isCoolingDown ? '0.6' : '1.0' }
            })
        );
    }

    return makeCard(`${cardTitlePrefix}: ${titleDisplay}`, cardElements);
}

// Selected-chapter subheading shown directly under the tab row on chapter-scoped tabs (E9)
function makeSelectedChapterHeader(chapter: ManuscriptChapter): any {
    return {
        type: 'container' as const,
        style: { margin: '6px 2px 2px 2px' },
        content: [
            makeHeading(formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle), 3, { margin: '0' }),
            makeText(
                `${formatNumber(chapter.wordCount)} words  ·  ~${chapter.pageCount} pages  ·  ~${formatNumber(chapter.tokenCount)} tokens`,
                false,
                { fontSize: '11px', color: MUTED_TEXT, margin: '2px 0 0 0' }
            )
        ]
    } as any;
}

// --- Main Panel Renderer ---

async function renderPanel(): Promise<void> {
    if (isPanelUpdateInProgress) {
        hasPendingPanelUpdate = true;
        return;
    }
    isPanelUpdateInProgress = true;
    try {
        do {
            hasPendingPanelUpdate = false;
            const contentParts: any[] = [];

            // 1. Header Bar with Native IconId
            contentParts.push({
                type: 'row' as const,
                alignment: 'center',
                content: [
                    makeHeading("Manuscript Menagerie", 2, { margin: '0' }),
                    makeButton(
                        appState.isScanning ? "Scanning..." : "Rescan",
                        async () => {
                            await scanDocumentChapters(true);
                            await scanLorebookCategories();
                            renderPanel();
                        },
                        {
                            disabled: appState.isScanning || appState.isGenerating,
                            disableWhileRunning: true,
                            iconId: 'refresh'
                        }
                    )
                ]
            } as any);

            // Status banner if active
            if (appState.statusMessage && appState.statusMessage !== "Ready") {
                contentParts.push(
                    makeText(`*Status: ${appState.statusMessage}*`, true, {
                        color: 'textMain',
                        fontSize: '12px',
                        margin: '2px 0 6px 0'
                    })
                );
            }

            // 2. Navigation Tabs
            const tabs: { key: ActiveTab; label: string }[] = [
                { key: 'overview', label: 'Overview' },
                { key: 'chapters', label: `Chapters (${appState.chapters.length})` },
                { key: 'inspector', label: 'Inspector' },
                { key: 'analysis', label: 'Analysis' },
                { key: 'summary', label: 'Summary' }
            ];

            const makeTabButton = (t: { key: ActiveTab; label: string }): any => makeButton(
                t.label,
                () => {
                    setActiveTab(t.key);
                    renderPanel();
                },
                {
                    primary: appState.activeTab === t.key,
                    overrideStyle: {
                        flex: '1',
                        padding: '5px 8px',
                        fontSize: '11px',
                        margin: '2px',
                        whiteSpace: 'nowrap'
                    }
                }
            );

            // Two groups in a wrapping row: when the panel is too narrow for all five,
            // the chapter-tool tabs (Inspector / Analysis / Summary) drop below Overview / Chapters.
            const makeTabGroup = (group: { key: ActiveTab; label: string }[], basis: string): any => ({
                type: 'row' as const,
                alignment: 'center',
                style: { flex: `1 1 ${basis}`, minWidth: '0' },
                content: group.map(makeTabButton)
            });

            contentParts.push({
                type: 'row' as const,
                alignment: 'center',
                wrap: true,
                content: [
                    makeTabGroup(tabs.slice(0, 2), '160px'),
                    makeTabGroup(tabs.slice(2), '220px')
                ]
            } as any);

            // 3. Tab Content Rendering
            const activeChapter = appState.chapters[appState.selectedChapterIndex] || appState.chapters[0];

            const isChapterTab = appState.activeTab === 'inspector' || appState.activeTab === 'analysis' || appState.activeTab === 'summary';
            if (isChapterTab && activeChapter) {
                contentParts.push(makeSelectedChapterHeader(activeChapter));
            }

            if (appState.activeTab === 'overview') {
                // --- Overview Tab ---
                const avgWords = appState.chapters.length > 0
                    ? Math.round(appState.metrics.totalWords / appState.chapters.length)
                    : 0;
                const avgPages = (avgWords / (appConfig.wordsPerPage || 350)).toFixed(1);
                const readMins = Math.round(appState.metrics.totalWords / 250);

                const overviewStats: any[] = [
                    makeText(`- **Story Title:** ${appState.storyTitle}`),
                    makeText(`- **Total Chapters:** ${appState.metrics.totalChapters}`)
                ];

                if (appConfig.showWordCount) {
                    overviewStats.push(makeText(`- **Total Words:** ${formatNumber(appState.metrics.totalWords)}`));
                }
                if (appConfig.showPageCount) {
                    overviewStats.push(makeText(`- **Total Pages:** ~${formatNumber(appState.metrics.totalPages)} (@ ${appConfig.wordsPerPage} w/p)`));
                }
                if (appConfig.showTokenCount) {
                    overviewStats.push(makeText(`- **Total Tokens:** ~${formatNumber(appState.metrics.totalTokens)}`));
                }
                if (appConfig.showCharCount) {
                    overviewStats.push(makeText(`- **Total Characters:** ${formatNumber(appState.metrics.totalChars)}`));
                }

                overviewStats.push(
                    makeText(`- **Average Chapter Length:** ${formatNumber(avgWords)} words (~${avgPages} pages)`),
                    makeText(`- **Estimated Reading Time:** ~${readMins} minutes`)
                );

                // Where chapters come from: the UCCDS script's shared rules, or the Menagerie's own options
                overviewStats.push(makeText(
                    appState.chapterSource === 'dependency'
                        ? `Chapters from the UCCDS script${appState.uccdsDependencyVersion ? ` v${appState.uccdsDependencyVersion}` : ""}: its chapter rules apply, and the Menagerie's [Chapters] options are ignored.`
                        : `Chapters from the built-in UCCDS v${UCCDS_VERSION}, using the [Chapters] options in this script's config.`,
                    false,
                    { fontSize: '11px', color: MUTED_TEXT, margin: '6px 0 0 0' }
                ));

                contentParts.push(makeCard("Manuscript Overview", overviewStats, { iconId: "list", isAccent: true }));

                if (appState.unmatchedReportCount > 0) {
                    const n = appState.unmatchedReportCount;
                    contentParts.push(makeCard("Unmatched Reports", [
                        makeText(`${n} saved report${n === 1 ? " doesn't" : "s don't"} match a chapter right now: the chapter header was changed or removed, or the chapter detection update couldn't place ${n === 1 ? "it" : "them"}. ${n === 1 ? "It's" : "They're"} kept, and reattach on their own if the header comes back.`),
                        makeButton("Delete Unmatched Reports", async () => {
                            const ok = await confirmModal(
                                "Delete Unmatched Reports?",
                                `This permanently deletes **${n}** saved report${n === 1 ? "" : "s"} that don't belong to any current chapter. Reports on your chapters and your Lorebook entries aren't touched.`,
                                "Delete",
                                'trash'
                            );
                            if (!ok) return;
                            const removed = await clearUnmatchedReports();
                            api.v1.ui.toast(`Deleted ${removed} unmatched report${removed === 1 ? "" : "s"}.`, { type: "success" });
                            await renderPanel();
                        }, { iconId: 'trash' })
                    ], { iconId: "info" }));
                }

                contentParts.push(makeLorebookOverviewCard());

                contentParts.push(makeButton("Browse Chapters & Actions", () => {
                    setActiveTab('chapters');
                    renderPanel();
                }, { primary: true, iconId: 'chevron-right' }));

            } else if (appState.activeTab === 'chapters') {
                // --- Chapters Tab ---
                if (appState.chapters.length === 0) {
                    contentParts.push(makeCard(null, [
                        makeText("No chapters detected. Click **Rescan** above or make sure your story document has text.")
                    ]));
                } else {
                    for (const ch of appState.chapters) {
                        const isSelected = (ch.index === appState.selectedChapterIndex);
                        const titleDisplay = formatChapterDisplayTitle(ch, appConfig.chapterNumberStyle);

                        const chapterChildren: any[] = [
                            makeHeading(titleDisplay, 3, {
                                color: isSelected ? 'textMain' : 'textHeadings',
                                margin: '0 0 6px 0'
                            })
                        ];

                        // Prominent, larger metrics display for each chapter
                        if (appConfig.showChapterSubcounts) {
                            const countElements: string[] = [];
                            if (appConfig.showChapterWordCount) countElements.push(`**${formatNumber(ch.wordCount)}** words`);
                            if (appConfig.showChapterPageCount) countElements.push(`**${ch.pageCount}** pages`);
                            if (appConfig.showChapterTokenCount) countElements.push(`**${formatNumber(ch.tokenCount)}** tokens`);
                            if (appConfig.showChapterCharCount) countElements.push(`**${formatNumber(ch.charCount)}** chars`);

                            if (countElements.length > 0) {
                                chapterChildren.push(
                                    makeText(countElements.join("   |   "), true, {
                                        fontSize: '13px',
                                        color: 'textHeadings',
                                        margin: '4px 0 6px 0'
                                    })
                                );
                            }
                        }

                        const statusBadges: string[] = [];
                        const chAnalysis = appState.analyses[ch.index];
                        const chSummary = appState.summaries[ch.index];
                        if (ch.hasAnalysis) {
                            if (chAnalysis?.truncated || chAnalysis?.suspectedTruncated) {
                                statusBadges.push("Analysis (Cut Short)");
                            } else {
                                statusBadges.push("Analysis Saved");
                            }
                        }
                        if (ch.hasSummary) {
                            if (chSummary?.truncated || chSummary?.suspectedTruncated) {
                                statusBadges.push("Summary (Cut Short)");
                            } else {
                                statusBadges.push("Summary Saved");
                            }
                        }

                        if (statusBadges.length > 0) {
                            chapterChildren.push(
                                makeText(`*${statusBadges.join("  •  ")}*`, true, {
                                    fontSize: '11px',
                                    color: 'textMain',
                                    margin: '2px 0 6px 0'
                                })
                            );
                        }

                        // Inspect button only
                        chapterChildren.push(
                            makeButton(isSelected ? "Selected" : "Inspect Chapter", () => {
                                setSelectedChapter(ch.index);
                                setActiveTab('inspector');
                                renderPanel();
                            }, { primary: isSelected, iconId: 'eye' })
                        );

                        contentParts.push(makeCard(null, chapterChildren, { isAccent: isSelected }));
                    }
                }

            } else if (appState.activeTab === 'inspector') {
                // --- Inspector Tab ---
                if (!activeChapter) {
                    contentParts.push(makeCard(null, [makeText("No chapter selected.")]));
                } else {
                    const inspectorStats: any[] = [
                        makeText(`- **Words:** ${formatNumber(activeChapter.wordCount)} (~${activeChapter.pageCount} pages @ ${appConfig.wordsPerPage} w/p)`),
                        makeText(`- **Tokens:** ~${formatNumber(activeChapter.tokenCount)} | **Characters:** ${formatNumber(activeChapter.charCount)}`)
                    ];

                    if (activeChapter.preview) {
                        inspectorStats.push(
                            // Plain text, not markdown: stray * _ [ ] # in the manuscript can't break the card (A6).
                            // makePreview already adds the single "…" when it cut the text (E11).
                            makeText(`\u201C${activeChapter.preview}\u201D`, false, {
                                fontSize: '12px',
                                fontStyle: 'italic',
                                color: MUTED_TEXT,
                                margin: '8px 0',
                                padding: '2px 0 2px 8px',
                                borderLeft: '2px solid bg3'
                            })
                        );
                    }

                    contentParts.push(makeCard("Chapter Details", inspectorStats));

                    // AI Editorial Actions Card
                    const isThisGenerating = appState.isGenerating && (appState.generatingChapterIndex === activeChapter.index);
                    const actionButtons: any[] = [
                        makeButton(
                            isThisGenerating && appState.generatingAction === 'analyze' ? "Analyzing..." : "Analyze Chapter",
                            async () => {
                                await analyzeChapterAction(activeChapter.index);
                            },
                            {
                                primary: true,
                                disabled: appState.isGenerating,
                                iconId: 'edit',
                                overrideStyle: { margin: '6px 0', width: '100%' }
                            }
                        ),
                        makeButton(
                            isThisGenerating && appState.generatingAction === 'summarize' ? "Summarizing..." : "Summarize Chapter",
                            async () => {
                                await summarizeChapterAction(activeChapter.index);
                            },
                            {
                                disabled: appState.isGenerating,
                                iconId: 'file-text',
                                overrideStyle: { margin: '6px 0', width: '100%' }
                            }
                        )
                    ];

                    contentParts.push(makeCard("Editorial Actions", actionButtons));

                    // Quick links to reports
                    const storedItems: any[] = [];
                    const inspAnalysis = appState.analyses[activeChapter.index];
                    const inspSummary = appState.summaries[activeChapter.index];
                    if (activeChapter.hasAnalysis) {
                        const isCut = inspAnalysis?.truncated || inspAnalysis?.suspectedTruncated;
                        storedItems.push(makeButton(isCut ? "View Analysis (Cut Short)" : "View Saved Analysis", () => {
                            setActiveTab('analysis');
                            renderPanel();
                        }, { iconId: 'chevron-right', primary: !!isCut }));
                    }
                    if (activeChapter.hasSummary) {
                        const isCut = inspSummary?.truncated || inspSummary?.suspectedTruncated;
                        storedItems.push(makeButton(isCut ? "View Summary (Cut Short)" : "View Saved Summary", () => {
                            setActiveTab('summary');
                            renderPanel();
                        }, { iconId: 'chevron-right', primary: !!isCut }));
                    }
                    if (activeChapter.hasAnalysis || activeChapter.hasSummary) {
                        storedItems.push(makeButton("Clear Cached Report(s)...", async () => {
                            await promptClearReportsModal(activeChapter.index);
                        }, { iconId: 'trash', overrideStyle: { margin: '6px 4px 2px 4px' } }));
                    }
                    if (storedItems.length > 0) {
                        contentParts.push(makeCard("Available Reports", storedItems));
                    }
                }

            } else if (appState.activeTab === 'analysis') {
                // --- Analysis Tab ---
                if (!activeChapter) {
                    contentParts.push(makeCard(null, [makeText("No chapter selected.")]));
                } else {
                    const analysis = appState.analyses[activeChapter.index];
                    const titleDisplay = formatChapterDisplayTitle(activeChapter, appConfig.chapterNumberStyle);
                    const badges: string[] = [];
                    if (analysis?.savedToLorebook) badges.push("Saved to Lorebook");

                    contentParts.push(makePromptOptionsCard({
                        panel: 'analysis',
                        cardTitle: "Analysis Prompt Options",
                        descriptionText: "*Customize chunks included in the analysis instruction block:*",
                        priorMode: appState.promptToggles.analysisPriorChapters as PriorChaptersMode,
                        priorSetter: setAnalysisPriorChapters,
                        extraToggles: [
                            makeToggleButton("Character Analysis", appState.promptToggles.analysisCharacter,
                                () => { togglePromptOption('analysisCharacter'); renderPanel(); }, appState.isGenerating),
                            makeToggleButton("Targeted Craft Questions", appState.promptToggles.analysisCraftQuestions,
                                () => { togglePromptOption('analysisCraftQuestions'); renderPanel(); }, appState.isGenerating)
                        ],
                        noteText: "*Note: Overarching Strengths and Thematic & Structural Notes are always active.*",
                        previewChunks: getAnalysisPromptChunks(appState.promptToggles)
                    }));

                    contentParts.push(makeReportDisplayCard({
                        panel: 'analysis',
                        chapterIndex: activeChapter.index,
                        titleDisplay,
                        report: analysis,
                        cardTitlePrefix: "Developmental Analysis",
                        emptyStateText: "No developmental analysis has been generated for this chapter yet.",
                        emptyStateButtonLabel: "Run Developmental Analysis Now",
                        emptyStateIconId: 'edit',
                        onRun: async () => analyzeChapterAction(activeChapter.index),
                        onCopy: async () => {
                            const ok = await copyTextToClipboard(analysis!.text);
                            if (ok) api.v1.ui.toast("Copied analysis to clipboard!", { type: "success" });
                        },
                        onAddToLorebook: async () => addAnalysisToLorebookAction(activeChapter.index),
                        onContinue: async () => continueAnalysisAction(activeChapter.index),
                        onRerun: async () => analyzeChapterAction(activeChapter.index),
                        onClear: async () => promptClearAnalysisModal(activeChapter.index),
                        rerunLabel: "Re-analyze",
                        rerunIconId: 'refresh',
                        continueActionKey: 'continue-analysis',
                        cooldownStorageKey: `analysis-${activeChapter.index}`,
                        badges
                    }));
                }

            } else if (appState.activeTab === 'summary') {
                // --- Summary Tab ---
                if (!activeChapter) {
                    contentParts.push(makeCard(null, [makeText("No chapter selected.")]));
                } else {
                    const summary = appState.summaries[activeChapter.index];
                    const titleDisplay = formatChapterDisplayTitle(activeChapter, appConfig.chapterNumberStyle);
                    const badges: string[] = [];
                    if (summary?.usedAnalysis) badges.push("Linked with Developmental Analysis");
                    if (summary?.savedToLorebook) badges.push("Saved to Lorebook");

                    contentParts.push(makePromptOptionsCard({
                        panel: 'summary',
                        cardTitle: "Summary Prompt Options",
                        descriptionText: "*Customize chunks included in the continuity summary prompt:*",
                        priorMode: appState.promptToggles.summaryPriorChapters as PriorChaptersMode,
                        priorSetter: setSummaryPriorChapters,
                        extraToggles: [
                            makeToggleButton("Use Chapter Analysis", appState.promptToggles.summaryUseAnalysis,
                                () => { togglePromptOption('summaryUseAnalysis'); renderPanel(); }, appState.isGenerating),
                            makeToggleButton("Key Developments", appState.promptToggles.summaryKeyDevelopments,
                                () => { togglePromptOption('summaryKeyDevelopments'); renderPanel(); }, appState.isGenerating),
                            makeToggleButton("Targeted Questions", appState.promptToggles.summaryTargetedQuestions,
                                () => { togglePromptOption('summaryTargetedQuestions'); renderPanel(); }, appState.isGenerating)
                        ],
                        noteText: "*Note: Main chapter summary prose is always active.*",
                        previewChunks: getSummaryPromptChunks(appState.promptToggles)
                    }));

                    contentParts.push(makeReportDisplayCard({
                        panel: 'summary',
                        chapterIndex: activeChapter.index,
                        titleDisplay,
                        report: summary,
                        cardTitlePrefix: "Chapter Summary",
                        emptyStateText: "No continuity summary has been generated for this chapter yet.",
                        emptyStateButtonLabel: "Generate Chapter Summary Now",
                        emptyStateIconId: 'file-text',
                        onRun: async () => summarizeChapterAction(activeChapter.index),
                        onCopy: async () => {
                            const ok = await copyTextToClipboard(summary!.text);
                            if (ok) api.v1.ui.toast("Copied summary to clipboard!", { type: "success" });
                        },
                        onAddToLorebook: async () => addSummaryToLorebookAction(activeChapter.index),
                        onContinue: async () => continueSummaryAction(activeChapter.index),
                        onRerun: async () => summarizeChapterAction(activeChapter.index),
                        onClear: async () => promptClearSummaryModal(activeChapter.index),
                        rerunLabel: "Re-summarize",
                        rerunIconId: 'refresh',
                        continueActionKey: 'continue-summary',
                        cooldownStorageKey: `summary-${activeChapter.index}`,
                        badges
                    }));
                }
            }

            // 5. Update Sidebar Panel in NovelAI
            await api.v1.ui.update([
                {
                    type: 'sidebarPanel' as const,
                    id: PANEL_ID,
                    name: 'Manuscript Menagerie',
                    iconId: 'bookOpen',
                    content: [
                        {
                            type: 'column' as const,
                            style: {
                                padding: '8px',
                                height: '100%',
                                overflowY: 'auto',
                                justifyContent: 'flex-start',
                                gap: '8px'
                            },
                            content: contentParts
                        } as any
                    ]
                } as any
            ]);
        } while (hasPendingPanelUpdate);
    } catch (err) {
        api.v1.log("Error rendering panel:", err);
    } finally {
        isPanelUpdateInProgress = false;
    }
}
