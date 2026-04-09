<script lang="ts">
    import { _ } from "svelte-i18n";
    import { createHash } from "crypto";
    import { checkPassword } from "$lib/helpers/mrm/admin";
    import {
        loginLoading,
        submitted,
        checked,
        correct,
    } from "$lib/stores/admin";
    import { onMount } from "svelte";

    let password = "";
    let showPassword = false;

    // Market depth visualization state
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let animationId: number;
    let bids: { price: number; size: number }[] = [];
    let asks: { price: number; size: number }[] = [];

    const login = async (pass: string) => {
        loginLoading.set(true);
        const hashedAdminPassword = createHash("sha256")
            .update(pass)
            .digest("hex");
        const accessToken = await checkPassword(hashedAdminPassword);
        if (accessToken) {
            submitted.set(true);
            checked.set(true);
            correct.set(true);
            localStorage.setItem("admin-access-token", accessToken);
            loginLoading.set(false);
            return true;
        }
        submitted.set(true);
        checked.set(true);
        correct.set(false);
        loginLoading.set(false);
        shakeError = true;
        setTimeout(() => (shakeError = false), 500);
        return false;
    };

    const togglePasswordVisibility = () => {
        showPassword = !showPassword;
    };

    // Generate synthetic market depth data
    function generateDepthData() {
        const basePrice = 67432.5;
        bids = [];
        asks = [];

        // Generate bids (below base price)
        let bidPrice = basePrice;
        for (let i = 0; i < 20; i++) {
            bidPrice -= Math.random() * 50 + 10;
            bids.push({
                price: bidPrice,
                size: Math.random() * 2 + 0.1,
            });
        }

        // Generate asks (above base price)
        let askPrice = basePrice;
        for (let i = 0; i < 20; i++) {
            askPrice += Math.random() * 50 + 10;
            asks.push({
                price: askPrice,
                size: Math.random() * 2 + 0.1,
            });
        }
    }

    // Update a single level (simulate live order book)
    function updateLevel() {
        const isBid = Math.random() > 0.5;
        const arr = isBid ? bids : asks;
        const idx = Math.floor(Math.random() * arr.length);
        if (arr[idx]) {
            arr[idx].size = Math.max(
                0.01,
                arr[idx].size + (Math.random() - 0.5) * 0.5,
            );
        }
    }

    // Draw the market depth visualization
    function drawDepth() {
        if (!ctx || !canvas) return;

        // Use logical dimensions for drawing logic since ctx is already scaled
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        // Clear canvas (physical dimensions are needed for clearing)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerY = height / 2;
        const rowHeight = height / 40;
        const maxSize = 2.5;
        // Ensure equal width for both sides regardless of canvas size
        const sideWidth = width / 2;

        // Draw bids (left side, green)
        bids.forEach((bid, i) => {
            const y = centerY - (i + 1) * rowHeight;
            const barWidth = (bid.size / maxSize) * (sideWidth * 0.9);

            ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
            ctx.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);

            // Highlight if size is significant
            if (bid.size > 1.5) {
                ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
                ctx.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);
            }
        });

        // Draw asks (right side, red)
        asks.forEach((ask, i) => {
            const y = centerY - (i + 1) * rowHeight;
            const barWidth = (ask.size / maxSize) * (sideWidth * 0.9);

            ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
            ctx.fillRect(sideWidth, y, barWidth, rowHeight - 1);

            if (ask.size > 1.5) {
                ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
                ctx.fillRect(sideWidth, y, barWidth, rowHeight - 1);
            }
        });

        // Draw mirror below center
        bids.forEach((bid, i) => {
            const y = centerY + i * rowHeight;
            const barWidth = (bid.size / maxSize) * (sideWidth * 0.9);

            ctx.fillStyle = "rgba(16, 185, 129, 0.06)";
            ctx.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);
        });

        asks.forEach((ask, i) => {
            const y = centerY + i * rowHeight;
            const barWidth = (ask.size / maxSize) * (sideWidth * 0.9);

            ctx.fillStyle = "rgba(239, 68, 68, 0.06)";
            ctx.fillRect(sideWidth, y, barWidth, rowHeight - 1);
        });

        // Draw center spread line
        ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sideWidth, 0);
        ctx.lineTo(sideWidth, height);
        ctx.stroke();
    }

    function animate() {
        updateLevel();
        drawDepth();
        animationId = requestAnimationFrame(() => {
            setTimeout(animate, 100);
        });
    }

    function setupCanvas() {
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);

        generateDepthData();
        drawDepth();
        animate();
    }

    onMount(() => {
        setupCanvas();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    });
</script>

<div class="min-h-screen w-full flex">
    <!-- Left side: Market depth visualization -->
    <div class="hidden lg:flex lg:w-1/2 relative bg-base-200 overflow-hidden">
        <canvas
            bind:this={canvas}
            class="absolute inset-0 w-full h-full"
            style="width: 100%; height: 100%;"
        />

        <!-- Overlay gradient for depth fade -->
        <div
            class="absolute inset-0 bg-gradient-to-r from-base-200 via-transparent to-transparent"
            style="width: 30%;"
        ></div>
        <div
            class="absolute inset-0 bg-gradient-to-l from-base-200 via-transparent to-transparent"
            style="left: 70%;"
        ></div>
        <div
            class="absolute inset-0 bg-gradient-to-b from-base-200 via-transparent to-base-200"
            style="height: 15%; top: 0;"
        ></div>
        <div
            class="absolute inset-0 bg-gradient-to-t from-base-200 via-transparent to-transparent"
            style="height: 15%; bottom: 0;"
        ></div>

        <!-- Brand mark -->
        <div class="absolute bottom-8 left-8">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 flex items-center justify-center">
                    <img
                        src="/mr-market-logo-transparent.svg"
                        alt="Mr.Market"
                        class="w-12 h-12 drop-shadow-sm"
                    />
                </div>
                <div>
                    <div
                        class="text-xl font-semibold text-base-content tracking-tight"
                    >
                        Mr.Market
                    </div>
                    <div class="text-sm text-base-content/50">
                        Market Making Engine
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Right side: Login form -->
    <div
        class="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 bg-base-100"
    >
        <!-- Mobile brand (visible only on small screens) -->
        <div class="lg:hidden flex items-center gap-3 mb-12">
            <div class="w-10 h-10 flex items-center justify-center">
                <img
                    src="/mr-market-logo-transparent.svg"
                    alt="Mr.Market"
                    class="w-10 h-10"
                />
            </div>
            <div>
                <div
                    class="text-lg font-semibold text-base-content tracking-tight"
                >
                    Mr.Market
                </div>
                <div class="text-xs text-base-content/50">
                    Market Making Engine
                </div>
            </div>
        </div>

        <!-- Login card -->
        <div class="w-full max-w-sm">
            <div class="mb-8 flex flex-col">
                <span
                    class="text-left text-3xl font-semibold text-base-content mb-2 tracking-tight"
                >
                    {$_("login")}
                </span>
                <span class="text-sm text-base-content/60 leading-relaxed">
                    {$_("welcome_to_admin_panel")}
                </span>
            </div>

            <form
                class="space-y-5"
                on:submit|preventDefault={() => login(password)}
            >
                <!-- Password input -->
                <div class="form-control">
                    <label for="password" class="label py-1.5">
                        <span class="label-text text-sm font-medium"
                            >{$_("enter_password")}</span
                        >
                    </label>
                    <div class="relative">
                        {#if showPassword}
                            <input
                                type="text"
                                name="password"
                                id="password"
                                bind:value={password}
                                class="input input-bordered w-full pr-11 h-11"
                                required
                                autofocus
                            />
                        {:else}
                            <input
                                type="password"
                                name="password"
                                id="password"
                                bind:value={password}
                                class="input input-bordered w-full pr-11 h-11"
                                required
                                autofocus
                            />
                        {/if}

                        <button
                            type="button"
                            on:click={togglePasswordVisibility}
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-base-content/40 hover:text-base-content transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-md"
                            aria-label={showPassword
                                ? "Hide password"
                                : "Show password"}
                        >
                            {#if showPassword}
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                </svg>
                            {:else}
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                    />
                                </svg>
                            {/if}
                        </button>
                    </div>
                </div>

                <!-- Error state -->
                {#if $submitted && $checked && !$correct}
                    <div
                        class="alert alert-error alert-sm py-2.5"
                        role="alert"
                        aria-live="polite"
                    >
                        <svg
                            class="w-4 h-4 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <span class="text-sm">{$_("password_incorrect")}</span>
                    </div>
                {/if}

                <!-- Submit button -->
                <button
                    type="submit"
                    class="btn btn-primary w-full h-11 gap-2"
                    disabled={$loginLoading || !password}
                >
                    {#if $loginLoading}
                        <span class="loading loading-spinner loading-sm"></span>
                        <span class="text-sm">{$_("loading")}...</span>
                    {:else}
                        <span class="text-sm font-medium">{$_("login")}</span>
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                            />
                        </svg>
                    {/if}
                </button>
            </form>

            <!-- Footer note -->
            <div class="mt-8 pt-6 border-t border-base-300">
                <p class="text-xs text-base-content/40 text-center">
                    Admin access only. Unauthorized use is prohibited.
                </p>
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes shake {
        0%,
        100% {
            transform: translateX(0);
        }
        10%,
        30%,
        50%,
        70%,
        90% {
            transform: translateX(-4px);
        }
        20%,
        40%,
        60%,
        80% {
            transform: translateX(4px);
        }
    }

    .animate-shake {
        animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    @media (prefers-reduced-motion: reduce) {
        .animate-shake {
            animation: none;
        }
    }
</style>
