import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<
	React.ComponentProps<typeof InputGroupInput>,
	"type"
> & {
	groupClassName?: string;
};

function PasswordInput({
	className,
	groupClassName,
	disabled,
	...props
}: PasswordInputProps) {
	const [visible, setVisible] = React.useState(false);

	return (
		<InputGroup className={cn(groupClassName)}>
			<InputGroupInput
				type={visible ? "text" : "password"}
				className={className}
				disabled={disabled}
				{...props}
			/>
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					type="button"
					variant="ghost"
					size="icon-xs"
					disabled={disabled}
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? "Hide password" : "Show password"}
				>
					{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}

export { PasswordInput };
