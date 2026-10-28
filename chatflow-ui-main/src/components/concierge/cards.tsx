import { useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Grid2X2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Ticket,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import kettleImage from "@/assets/copper-kettle.jpg";

export function ChatCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`chat-card ${className}`}>{children}</div>;
}

export function ProductCard({ onDetails }: { onDetails: () => void }) {
  return (
    <ChatCard>
      <div className="product-row">
        <div className="product-monogram">hy</div>
        <div className="product-copy">
          <strong>Aura Pour-Over Station</strong>
          <span>Cast Brass & Borosilicate glass</span>
        </div>
        <strong className="product-price">$480</strong>
      </div>
      <div className="product-bottom">
        <span className="stock-label">
          <i />
          In Atelier Showroom
        </span>
        <Button variant="link" size="sm" onClick={onDetails}>
          View Details <ChevronRight />
        </Button>
      </div>
    </ChatCard>
  );
}

export function ProductActions({ onAction }: { onAction: (label: string) => void }) {
  return (
    <div className="product-actions">
      {[
        { label: "Check Specifications", icon: FileText },
        { label: "Reserve in Zurich", icon: MapPin },
        { label: "Copper Collection", icon: Grid2X2 },
        { label: "Warranty & Care", icon: ShieldCheck },
      ].map(({ label, icon: Icon }) => (
        <Button key={label} variant="action" onClick={() => onAction(label)}>
          <Icon />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}

export function VerifiedCard() {
  return (
    <div className="verified-card">
      <strong>
        <Check />
        Order verified
      </strong>
      <p>
        <span className="mono">ORD–005</span> · Delivered 3 Oct · 19 days left to return
      </p>
    </div>
  );
}

export function ReturnItemCard({
  quantity,
  onQuantity,
  onReturn,
}: {
  quantity: number;
  onQuantity: (n: number) => void;
  onReturn: () => void;
}) {
  return (
    <ChatCard>
      <div className="product-row">
        <div className="product-monogram small">GB</div>
        <div className="product-copy">
          <strong>Gadget B</strong>
          <span>₹50.00 · Ordered 3</span>
        </div>
        <div className="quantity-stepper">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Decrease quantity"
            onClick={() => onQuantity(Math.max(1, quantity - 1))}
          >
            <Minus />
          </Button>
          <strong>{quantity}</strong>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Increase quantity"
            onClick={() => onQuantity(Math.min(3, quantity + 1))}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <Button className="card-primary" onClick={onReturn}>
        Return this item
      </Button>
    </ChatCard>
  );
}

export function ChoiceChips({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="choice-chips">
      {options.map((option) => (
        <Button
          key={option}
          variant={selected === option ? "selected" : "chip"}
          size="sm"
          onClick={() => onSelect(option)}
        >
          {selected === option && <Check />}
          {option}
        </Button>
      ))}
    </div>
  );
}

export function PhotoCard({ onContinue }: { onContinue: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([kettleImage]);
  return (
    <ChatCard>
      <div className="photo-grid">
        {photos.map((src, i) => (
          <div className="photo-tile" key={src}>
            <img
              src={src}
              width={64}
              height={64}
              alt={`Product attachment ${i + 1}`}
              loading="lazy"
            />
            <span>IMG_0{i + 2}.jpg</span>
            <Button
              variant="send"
              size="icon-xs"
              className="remove-photo"
              aria-label="Remove photo"
              onClick={() => setPhotos(photos.filter((_, index) => index !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        {photos.length < 4 && (
          <Button variant="ghost" className="add-photo" onClick={() => input.current?.click()}>
            <Plus />
            <span>Add</span>
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(0, 4 - photos.length);
          setPhotos([...photos, ...files.map((file) => URL.createObjectURL(file))]);
        }}
      />
      <div className="photo-status">
        <span>
          <Check />
          {photos.length} photo{photos.length === 1 ? "" : "s"} added
        </span>
        <Button variant="link" size="sm" onClick={onContinue}>
          I can't right now
        </Button>
      </div>
      <Button className="card-primary" disabled={photos.length === 0} onClick={onContinue}>
        Continue
      </Button>
    </ChatCard>
  );
}

export function ReviewCard({
  quantity,
  reason,
  outcome,
  onConfirm,
  onEdit,
  onCancel,
}: {
  quantity: number;
  reason: string;
  outcome: string;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <ChatCard>
      <div className="card-heading">
        <strong>
          <FileText />
          Review your request
        </strong>
        <span className="mono">Step 5 of 6</span>
      </div>
      <dl className="review-details">
        <div>
          <dt>Item:</dt>
          <dd>Gadget B × {quantity}</dd>
        </div>
        <div>
          <dt>Order:</dt>
          <dd className="mono">ORD–005</dd>
        </div>
        <div>
          <dt>Reason:</dt>
          <dd>
            {reason} <span>· 1 photo</span>
          </dd>
        </div>
        <div>
          <dt>Outcome:</dt>
          <dd className="success-text">{outcome}</dd>
        </div>
      </dl>
      <div className="review-actions">
        <Button onClick={onConfirm}>Confirm</Button>
        <Button variant="chip" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </ChatCard>
  );
}

export function TicketCard({ onStatus, onAgent }: { onStatus: () => void; onAgent: () => void }) {
  return (
    <ChatCard>
      <div className="ticket-heading">
        <Ticket />
        <div>
          <strong className="mono">TKT–000004</strong>
          <span>Return · ORD–005 · Updated just now</span>
        </div>
        <span className="review-badge">In review</span>
      </div>
      <div className="ticket-stages">
        <span className="created">
          <i />
          Created
        </span>
        <span className="in-review">
          <i />
          Review
        </span>
        <span>Pickup</span>
        <span>Refund</span>
      </div>
      <div className="ticket-progress">
        <i />
        <i />
      </div>
      <p className="ticket-description">
        Your refund request was raised successfully. We'll notify you as soon as it is reviewed.
      </p>
      <div className="ticket-actions">
        <Button variant="chip" onClick={onStatus}>
          Check status
        </Button>
        <Button variant="outline" onClick={onAgent}>
          Talk to agent
        </Button>
      </div>
    </ChatCard>
  );
}

export function FeedbackCard({ onAgent }: { onAgent: () => void }) {
  const [rating, setRating] = useState(0);
  return (
    <ChatCard>
      <div className="card-heading feedback-heading">
        <strong>{rating ? "Thank you for your feedback" : "How was your experience?"}</strong>
        <span>Feedback</span>
      </div>
      <div className="rating-row">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            variant={rating === value ? "selected" : "chip"}
            aria-label={`Rate ${value} stars`}
            onClick={() => setRating(value)}
          >
            <Star />
            {value}
          </Button>
        ))}
      </div>
      <Button variant="chip" className="feedback-agent" onClick={onAgent}>
        <MessageCircle />
        Talk to an agent
      </Button>
    </ChatCard>
  );
}

export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ChatCard>
      <div className="card-heading">
        <strong>{title}</strong>
        <ArrowUpRight />
      </div>
      <div className="detail-content">{children}</div>
    </ChatCard>
  );
}
