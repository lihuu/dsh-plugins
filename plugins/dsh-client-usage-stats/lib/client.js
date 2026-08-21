window.__ModuleLoader__.load({
	id: "@local/dsh-client-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/UsageSection.tsx
		/**
		* UsageSection — the "用量统计" settings page. Rides the session-list
		* projection column: every session summary already carries its durable
		* tokenUsage projection values (live sessions from the watermark cache, cold
		* sessions from the persisted projection cache), so this page is a pure
		* client-side aggregate with no host round trip beyond the list itself.
		*/
		/** Sum the four disjoint usage buckets over all session summaries. */
		function aggregateUsage(byId) {
			let sessions = 0;
			let uncachedInput = 0;
			let cacheRead = 0;
			let cacheWrite = 0;
			let output = 0;
			for (const summary of Object.values(byId)) {
				const usage = summary.projectionValues?.tokenUsage;
				if (usage === void 0) continue;
				sessions += 1;
				uncachedInput += usage.uncachedInputTokens;
				cacheRead += usage.cacheReadTokens;
				cacheWrite += usage.cacheWriteTokens;
				output += usage.outputTokens;
			}
			return {
				sessions,
				uncachedInput,
				cacheRead,
				cacheWrite,
				output
			};
		}
		/** Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits). */
		function formatTokens(n) {
			const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
			if (n < 1e3) return String(n);
			if (n < 1e6) return `${scaled(n / 1e3)}K`;
			return `${scaled(n / 1e6)}M`;
		}
		/**
		* The Usage statistics settings page.
		* @param props - settings section owner props plus the bound translator.
		* @returns the aggregate usage panel.
		*/
		function UsageSection({ useSessions, t }) {
			const totals = useSessions((state) => aggregateUsage(state.byId));
			const hasUsage = totals.sessions > 0 && (totals.uncachedInput > 0 || totals.cacheRead > 0 || totals.cacheWrite > 0 || totals.output > 0);
			const grandTotal = (0, react.useMemo)(() => totals.uncachedInput + totals.cacheRead + totals.cacheWrite + totals.output, [totals]);
			if (!hasUsage) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					style: styles.title,
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: styles.empty,
					children: t("empty")
				})]
			});
			const rows = [
				[t("uncachedInput"), totals.uncachedInput],
				[t("cacheRead"), totals.cacheRead],
				[t("cacheWrite"), totals.cacheWrite],
				[t("output"), totals.output]
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: styles.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.description,
						children: t("description")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.totalCard,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.totalValue,
							children: formatTokens(grandTotal)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.totalLabel,
							children: t("total")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: styles.rows,
						children: rows.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles.row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.rowLabel,
								children: label
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.rowValue,
								children: formatTokens(value)
							})]
						}, label))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.sessions,
						children: t("sessions", { count: totals.sessions })
					})
				]
			});
		}
		const styles = {
			section: {
				display: "flex",
				flexDirection: "column",
				gap: 12,
				padding: "4px 2px"
			},
			title: {
				margin: 0,
				fontSize: 18,
				fontWeight: 600,
				color: "var(--dsw-text, #e8e8e8)"
			},
			description: {
				margin: 0,
				fontSize: 13,
				color: "var(--dsw-text-muted, #9a9a9a)"
			},
			totalCard: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				padding: "16px 20px",
				borderRadius: 10,
				backgroundColor: "var(--dsw-surface-raised, rgba(255,255,255,0.06))"
			},
			totalValue: {
				fontSize: 32,
				fontWeight: 700,
				color: "var(--dsw-accent, #4d9fff)"
			},
			totalLabel: {
				fontSize: 13,
				color: "var(--dsw-text-muted, #9a9a9a)"
			},
			rows: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			row: {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				fontSize: 14
			},
			rowLabel: { color: "var(--dsw-text, #e8e8e8)" },
			rowValue: {
				color: "var(--dsw-text-strong, #ffffff)",
				fontWeight: 600,
				fontVariantNumeric: "tabular-nums"
			},
			sessions: {
				margin: 0,
				fontSize: 13,
				color: "var(--dsw-text-muted, #9a9a9a)"
			},
			empty: {
				margin: 0,
				fontSize: 14,
				color: "var(--dsw-text-muted, #9a9a9a)"
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy dictionaries for the Usage statistics settings section.
		*/
		/** English strings (the key-set source of truth for this pair). */
		const en = {
			nav: "Usage",
			title: "Usage statistics",
			total: "Total tokens (input + output)",
			uncachedInput: "Uncached input",
			cacheRead: "Cache read",
			cacheWrite: "Cache write",
			output: "Output",
			sessions: "{count} sessions",
			noUsage: "No usage data yet",
			description: "Aggregated across all sessions since the first launch.",
			empty: "No usage data recorded yet."
		};
		/** Chinese strings. */
		const zh = {
			nav: "用量统计",
			title: "用量统计",
			total: "总用量（输入 + 输出）",
			uncachedInput: "未缓存输入",
			cacheRead: "缓存读取",
			cacheWrite: "缓存写入",
			output: "输出",
			sessions: "{count} 个会话",
			noUsage: "暂无用量数据",
			description: "自首次使用以来，所有会话的累计用量。",
			empty: "还没有用量数据。"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.usage";
		/** Plugin row name used by the cordis loader entry. */
		const name = "client-usage-stats";
		/** Required services: the slot system and the locale registry. */
		const inject = ["slots", "locale"];
		/**
		* Register the Usage section once the `settings.section` declaration is on
		* the ledger.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "usage-stats: copy dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "usage",
				order: 100,
				label: () => t("nav"),
				locale: NS
			}, UsageSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
