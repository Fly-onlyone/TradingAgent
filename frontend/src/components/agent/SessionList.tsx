/**
 * Session List Component for Chat History Sidebar
 */

import {
	ChevronDown,
	ChevronUp,
	MessageCircle,
	MoreVertical,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentSession, SessionsByDateGroup } from "@/types/session";

interface SessionListProps {
	groups: SessionsByDateGroup[];
	currentSessionId?: string;
	isLoading?: boolean;
	onSessionSelect: (sessionId: string) => void;
	onNewSession: () => void;
	onDeleteSession?: (sessionId: string) => void;
	onRenameSession?: (sessionId: string, newTitle: string) => void;
}

interface SessionItemProps {
	session: AgentSession;
	isSelected: boolean;
	onSelect: () => void;
	onDelete?: () => void;
	onRename?: (newTitle: string) => void;
}

function SessionItem({
	session,
	isSelected,
	onSelect,
	onDelete,
	onRename,
}: SessionItemProps) {
	const handleDelete = () => {
		onDelete?.();
	};

	const handleRename = () => {
		const newTitle = prompt("Enter new title:", session.title || "");
		if (newTitle && newTitle !== session.title) {
			onRename?.(newTitle);
		}
	};

	// Format display info
	const displayTitle = session.title || "New Chat";
	const messageCount = session.totalMessages;
	const hasDecisions = session.decisionsMade > 0;

	return (
		<motion.div
			initial={{ opacity: 0, x: -20 }}
			animate={{ opacity: 1, x: 0 }}
			className="mb-1"
		>
			<div
				role="button"
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect();
				}}
				className={cn(
					"flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted",
					isSelected && "bg-muted",
				)}
			>
				<MessageCircle
					className={cn(
						"size-4 shrink-0",
						isSelected
							? "text-[var(--primary)]"
							: "text-muted-foreground",
					)}
				/>
				<div className="min-w-0 flex-1">
					<p
						className={cn(
							"max-w-[160px] truncate text-sm",
							isSelected ? "font-semibold" : "font-normal",
						)}
					>
						{displayTitle}
					</p>
					<div className="mt-0.5 flex items-center gap-1">
						<span className="text-xs text-muted-foreground">
							{messageCount} messages
						</span>
						{hasDecisions && (
							<Badge
								variant="outline"
								className="h-4 px-1 text-[0.65rem]"
							>
								{session.decisionsMade} decisions
							</Badge>
						)}
					</div>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								className="ml-1 opacity-60 hover:opacity-100"
								onClick={(e) => e.stopPropagation()}
							/>
						}
					>
						<MoreVertical className="size-3.5" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" side="right">
						<DropdownMenuItem onClick={handleRename}>
							<Pencil className="size-3.5" />
							Rename
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={handleDelete}
						>
							<Trash2 className="size-3.5" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</motion.div>
	);
}

interface DateGroupProps {
	group: SessionsByDateGroup;
	currentSessionId?: string;
	onSessionSelect: (sessionId: string) => void;
	onDeleteSession?: (sessionId: string) => void;
	onRenameSession?: (sessionId: string, newTitle: string) => void;
}

function DateGroup({
	group,
	currentSessionId,
	onSessionSelect,
	onDeleteSession,
	onRenameSession,
}: DateGroupProps) {
	const [isExpanded, setIsExpanded] = useState(true);

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={setIsExpanded}
			className="mb-2"
		>
			<CollapsibleTrigger
				className="flex w-full items-center rounded-md px-2 py-1 hover:bg-muted"
			>
				<span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{group.label}
				</span>
				<span className="mr-1 text-xs text-muted-foreground/60">
					{group.sessions.length}
				</span>
				{isExpanded ? (
					<ChevronUp className="size-4 text-muted-foreground" />
				) : (
					<ChevronDown className="size-4 text-muted-foreground" />
				)}
			</CollapsibleTrigger>

			<CollapsibleContent>
				<nav className="pl-2">
					<AnimatePresence>
						{group.sessions.map((session) => (
							<SessionItem
								key={session.id}
								session={session}
								isSelected={session.id === currentSessionId}
								onSelect={() => onSessionSelect(session.id)}
								onDelete={
									onDeleteSession
										? () => onDeleteSession(session.id)
										: undefined
								}
								onRename={
									onRenameSession
										? (newTitle) =>
												onRenameSession(
													session.id,
													newTitle,
												)
										: undefined
								}
							/>
						))}
					</AnimatePresence>
				</nav>
			</CollapsibleContent>
		</Collapsible>
	);
}

function SessionListSkeleton() {
	return (
		<div className="px-2">
			{[1, 2, 3].map((i) => (
				<div key={i} className="mb-4">
					<Skeleton className="mb-2 h-5 w-20" />
					{[1, 2].map((j) => (
						<div
							key={j}
							className="mb-2 flex items-center gap-2 pl-2"
						>
							<Skeleton className="size-5 rounded-full" />
							<div className="flex-1">
								<Skeleton className="mb-1 h-4.5 w-[80%]" />
								<Skeleton className="h-3.5 w-[50%]" />
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export function SessionList({
	groups,
	currentSessionId,
	isLoading = false,
	onSessionSelect,
	onNewSession,
	onDeleteSession,
	onRenameSession,
}: SessionListProps) {
	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border p-4">
				<h3 className="text-sm font-semibold">Chat History</h3>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onNewSession}
								className="text-[var(--primary)]"
							/>
						}
					>
						<Plus className="size-4" />
					</TooltipTrigger>
					<TooltipContent>New Chat</TooltipContent>
				</Tooltip>
			</div>

			{/* Session List */}
			<div className="flex-1 overflow-auto p-2">
				{isLoading ? (
					<SessionListSkeleton />
				) : groups.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
						<MessageCircle className="mb-2 size-12 opacity-50" />
						<p className="text-center text-sm">
							No chat history yet
						</p>
						<p className="text-center text-xs text-muted-foreground/60">
							Start a new conversation to begin
						</p>
					</div>
				) : (
					<AnimatePresence>
						{groups.map((group) => (
							<DateGroup
								key={group.date}
								group={group}
								currentSessionId={currentSessionId}
								onSessionSelect={onSessionSelect}
								onDeleteSession={onDeleteSession}
								onRenameSession={onRenameSession}
							/>
						))}
					</AnimatePresence>
				)}
			</div>

			{/* Footer */}
			<Separator />
			<div className="p-3">
				<p className="text-center text-xs text-muted-foreground/60">
					{groups.reduce((sum, g) => sum + g.sessions.length, 0)}{" "}
					conversations
				</p>
			</div>
		</div>
	);
}

export default SessionList;
