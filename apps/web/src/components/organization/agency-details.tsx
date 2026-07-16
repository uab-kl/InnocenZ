import { Building2, Hash, Mail, Phone, User } from "lucide-react";
import type { ComponentType } from "react";
import type { Agency } from "@/services/agency";

function DetailField({
	icon: Icon,
	label,
	value,
	href,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string | null;
	href?: string;
}) {
	return (
		<div className="flex items-start gap-2">
			<Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0">
				<div className="text-xs uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
				{value && href ? (
					<a
						href={href}
						className="break-words text-sm font-medium text-primary hover:underline"
					>
						{value}
					</a>
				) : (
					<div className="break-words text-sm font-medium">{value || "—"}</div>
				)}
			</div>
		</div>
	);
}

export function AgencyDetails({ agency }: { agency: Agency }) {
	return (
		<div className="space-y-2 py-1">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Agency details
			</p>
			<div className="grid grid-cols-1 gap-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
				<DetailField icon={User} label="Owner" value={agency.contactName} />
				<DetailField
					icon={Mail}
					label="Email"
					value={agency.contactEmail}
					href={
						agency.contactEmail ? `mailto:${agency.contactEmail}` : undefined
					}
				/>
				<DetailField
					icon={Phone}
					label="Phone"
					value={agency.contactPhone}
					href={agency.contactPhone ? `tel:${agency.contactPhone}` : undefined}
				/>
				<DetailField icon={Hash} label="SSM / Org No." value={agency.ssmNo} />
				<DetailField
					icon={Building2}
					label="Agency code"
					value={agency.agencyCode}
				/>
			</div>
		</div>
	);
}
