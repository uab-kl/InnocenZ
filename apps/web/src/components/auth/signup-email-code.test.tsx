import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SignupEmailCode } from "@/lib/auth/use-signup-email-code";
import { signupTranslations } from "@/lib/landing-i18n/signup-translations";
import { SignupEmailCodeBox } from "./signup-email-code";

/**
 * THE "VERIFY YOUR EMAIL" BOX, AS THE PERSON READS IT — in both languages,
 * with the real dictionaries. Its state is a plain object here; the hook that
 * produces it is pinned in use-signup-email-code.test.tsx.
 */

const en = signupTranslations.en;
const zh = signupTranslations.zh;
const SENT = "We sent a 6-digit code to that email — it expires in 10 minutes";

function state(overrides: Partial<SignupEmailCode> = {}): SignupEmailCode {
	return {
		sentTo: null,
		code: "",
		setCode: vi.fn(),
		sending: false,
		resendIn: 0,
		canSend: true,
		notice: null,
		send: vi.fn(),
		changeEmail: vi.fn(),
		proof: null,
		afterRefusal: vi.fn(),
		...overrides,
	};
}

function renderBox(
	s: SignupEmailCode,
	copy = en,
	extra: { disabled?: boolean; email?: string } = {},
) {
	const onSend = vi.fn();
	const onChangeEmail = vi.fn();
	render(
		<SignupEmailCodeBox
			id="box"
			email={extra.email ?? "owner@venue.com"}
			state={s}
			copy={copy}
			disabled={extra.disabled}
			onSend={onSend}
			onChangeEmail={onChangeEmail}
		/>,
	);
	return { onSend, onChangeEmail };
}

describe("SignupEmailCodeBox · send code", () => {
	it("names the address it will prove and offers a gold Send", () => {
		const { onSend } = renderBox(state());
		expect(screen.getByText(en.emailCode.title)).toBeTruthy();
		expect(screen.getByText("owner@venue.com")).toBeTruthy();
		const send = screen.getByRole("button", { name: en.emailCode.sendCode });
		expect(send.className).toContain("bg-royal-gold");
		fireEvent.click(send);
		expect(onSend).toHaveBeenCalledTimes(1);
		// No code field until a code exists.
		expect(
			screen.queryByLabelText(new RegExp(en.emailCode.codeLabel)),
		).toBeNull();
	});

	it("asks for the email first when there is none", () => {
		renderBox(state({ canSend: false }), en, { email: "" });
		expect(screen.getByText(en.emailCode.leadNoEmail)).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: en.emailCode.sendCode,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("counts the server's window down on the button", () => {
		renderBox(state({ canSend: false, resendIn: 42 }), zh);
		const button = screen.getByRole("button", {
			name: "42 秒后可重新发送",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it("a refused send shows the server's sentence in the reader's language", () => {
		renderBox(
			state({
				notice: {
					kind: "sendRefused",
					message:
						"Too many verification codes requested for that email. Please try again later.",
				},
			}),
			zh,
		);
		expect(screen.getByRole("status").textContent).toBe(
			zh.emailCode.serverTooManyCodesForEmail,
		);
	});

	it("after a refused sign-up spent the code, says a new one is needed", () => {
		renderBox(state({ notice: { kind: "resend" } }));
		expect(screen.getByRole("status").textContent).toBe(
			en.emailCode.newCodeNeeded,
		);
		expect(
			screen.getByRole("button", { name: en.emailCode.sendCode }),
		).toBeTruthy();
	});
});

describe("SignupEmailCodeBox · code sent", () => {
	const sent = () =>
		state({
			sentTo: "owner@venue.com",
			canSend: false,
			resendIn: 60,
			notice: { kind: "sent", message: SENT },
		});

	it("confirms with the server's own sentence and takes six digits", () => {
		const s = sent();
		renderBox(s, zh);
		expect(screen.getByRole("status").textContent).toBe(
			zh.emailCode.serverSent,
		);
		const input = screen.getByLabelText(new RegExp(zh.emailCode.codeLabel));
		expect(input.getAttribute("autocomplete")).toBe("one-time-code");
		expect(input.getAttribute("inputmode")).toBe("numeric");
		fireEvent.change(input, { target: { value: "123456" } });
		expect(s.setCode).toHaveBeenCalledWith("123456");
	});

	it("keeps Resend behind the window, and Change email always there", () => {
		const { onChangeEmail, onSend } = renderBox(sent());
		const resend = screen.getByRole("button", {
			name: "Resend in 60s",
		}) as HTMLButtonElement;
		expect(resend.disabled).toBe(true);
		fireEvent.click(
			screen.getByRole("button", { name: en.emailCode.changeEmail }),
		);
		expect(onChangeEmail).toHaveBeenCalledTimes(1);
		expect(onSend).not.toHaveBeenCalled();
	});

	it("offers Resend once the window has run", () => {
		const { onSend } = renderBox(
			state({ sentTo: "owner@venue.com", canSend: true }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: en.emailCode.resendCode }),
		);
		expect(onSend).toHaveBeenCalledTimes(1);
	});

	it("a wrong code asks for it again, in the reader's language", () => {
		renderBox(
			state({ sentTo: "owner@venue.com", notice: { kind: "retype" } }),
			zh,
		);
		expect(screen.getByRole("status").textContent).toBe(
			zh.emailCode.retypeHint,
		);
	});

	it("is inert while the sign-up is being submitted", () => {
		renderBox(state({ sentTo: "owner@venue.com", canSend: true }), en, {
			disabled: true,
		});
		expect(
			(
				screen.getByLabelText(
					new RegExp(en.emailCode.codeLabel),
				) as HTMLInputElement
			).disabled,
		).toBe(true);
		for (const name of [en.emailCode.resendCode, en.emailCode.changeEmail]) {
			expect(
				(screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
			).toBe(true);
		}
	});
});
