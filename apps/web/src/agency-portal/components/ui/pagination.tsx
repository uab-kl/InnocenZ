import {
	type ButtonProps,
	buttonVariants,
} from "@agency-portal/components/ui/button";
import { cn } from "@agency-portal/lib/utils";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => {
	const { t } = usePortalLocale();

	return (
		<nav
			// Before the spread: the landmark's default name, still overridable by
			// a consumer that has a better one.
			aria-label={t.portalUi.pagination}
			className={cn("mx-auto flex w-full justify-center", className)}
			{...props}
		/>
	);
};
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
	HTMLUListElement,
	React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
	<ul
		ref={ref}
		className={cn("flex flex-row items-center gap-1", className)}
		{...props}
	/>
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
	HTMLLIElement,
	React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
	<li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
	isActive?: boolean;
} & Pick<ButtonProps, "size"> &
	React.ComponentProps<"a">;

const PaginationLink = ({
	className,
	isActive,
	size = "icon",
	...props
}: PaginationLinkProps) => (
	<a
		aria-current={isActive ? "page" : undefined}
		className={cn(
			buttonVariants({
				variant: isActive ? "outline" : "ghost",
				size,
			}),
			className,
		)}
		{...props}
	/>
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
	className,
	...props
}: React.ComponentProps<typeof PaginationLink>) => {
	const { t } = usePortalLocale();

	return (
		<PaginationLink
			aria-label={t.portalUi.goToPreviousPage}
			size="default"
			className={cn("gap-1 pl-2.5", className)}
			{...props}
		>
			<ChevronLeft className="h-4 w-4" />
			<span>{t.portalUi.previous}</span>
		</PaginationLink>
	);
};
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
	className,
	...props
}: React.ComponentProps<typeof PaginationLink>) => {
	const { t } = usePortalLocale();

	return (
		<PaginationLink
			aria-label={t.portalUi.goToNextPage}
			size="default"
			className={cn("gap-1 pr-2.5", className)}
			{...props}
		>
			<span>{t.portalUi.next}</span>
			<ChevronRight className="h-4 w-4" />
		</PaginationLink>
	);
};
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
	className,
	...props
}: React.ComponentProps<"span">) => {
	const { t } = usePortalLocale();

	return (
		<span
			aria-hidden
			className={cn("flex h-9 w-9 items-center justify-center", className)}
			{...props}
		>
			<MoreHorizontal className="h-4 w-4" />
			<span className="sr-only">{t.portalUi.morePages}</span>
		</span>
	);
};
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
};
