import { Mail, MessageSquare, MessageCircle, Bell, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type ChannelType = "email" | "sms" | "whatsapp" | "push";

const CHANNEL_ICONS: Record<ChannelType, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  push: Bell,
};

interface ChannelIconProps {
  channel: string;
  className?: string;
  size?: number;
}

function ChannelIcon({ channel, className, size = 16 }: ChannelIconProps) {
  const Icon =
    CHANNEL_ICONS[channel.toLowerCase() as ChannelType] ?? Send;
  return <Icon className={cn("shrink-0", className)} size={size} />;
}

export { ChannelIcon };
export type { ChannelIconProps };
