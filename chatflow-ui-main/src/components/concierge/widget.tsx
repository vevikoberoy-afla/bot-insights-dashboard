import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, ImageIcon, MessageCircle, Mic, X } from "lucide-react";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  ChoiceChips,
  DetailCard,
  FeedbackCard,
  PhotoCard,
  ProductActions,
  ProductCard,
  ReturnItemCard,
  ReviewCard,
  TicketCard,
  VerifiedCard,
} from "./cards";

function AgentMessage({
  children,
  named = false,
  id,
}: {
  children: ReactNode;
  named?: boolean;
  id?: string;
}) {
  return (
    <Message from="assistant" className="agent-message" id={id}>
      <div className={named ? "agent-avatar" : "continuation-dot"}>{named && <i />}</div>
      <div className="agent-content">
        {children}
        {named && <div className="agent-name">SIEXY</div>}
      </div>
    </Message>
  );
}
function AgentText({ children }: { children: string }) {
  return (
    <MessageContent className="assistant-bubble">
      <MessageResponse>{children}</MessageResponse>
    </MessageContent>
  );
}
function UserMessage({ children, now = false }: { children: string; now?: boolean }) {
  return (
    <Message from="user" className="user-message">
      <MessageContent className="user-bubble">{children}</MessageContent>
      <span className="delivered">Delivered{now ? " · Just now" : ""}</span>
    </Message>
  );
}

export function ConciergeWidget() {
  const [open, setOpen] = useState(true);
  const [quantity, setQuantity] = useState(2);
  const [reason, setReason] = useState("Damaged");
  const [outcome, setOutcome] = useState("Refund INR 150");
  const [confirmed, setConfirmed] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [extras, setExtras] = useState<{ text: string; user?: boolean }[]>([]);
  const [details, setDetails] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const firstCard = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      firstCard.current?.scrollIntoView({ block: "start" });
      textarea.current?.focus({ preventScroll: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [open]);
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const reply = (text: string) => {
    setExtras((previous) => [...previous, { text }]);
    setTimeout(() => {
      document.getElementById("chat-end")?.scrollIntoView({ behavior: "smooth" });
      textarea.current?.focus({ preventScroll: true });
    }, 80);
  };
  const agent = () =>
    reply(
      "Your request to speak with a human agent has been noted. This is a frontend preview; no live agent is connected.",
    );
  const quickAction = (label: string) => {
    if (label === "Return item") jump("return-order");
    else if (label === "Order status") jump("return-ticket");
    else if (label === "Refund policy") setDetails("Refund policy");
    else agent();
  };

  return (
    <>
      {open && (
        <section className="concierge-widget" aria-label="SIEXY concierge chat">
          <header className="widget-header">
            <div className="brand-pill brandpill">
              <i />
              <strong>SIEXY</strong>
              <span className="brand-divider">·</span>
              <span>Concierge</span>
            </div>
            <div className="header-actions">
              <span className="live-badge">Live Assistant</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Minimize chat"
                title="Minimize chat"
                onClick={() => setOpen(false)}
              >
                <ChevronDown />
              </Button>
            </div>
          </header>
          <Conversation className="chat-conversation" initial={false} resize="instant">
            <ConversationContent className="chat-transcript">
              <div ref={firstCard} className="first-card">
                <AgentMessage>
                  <ProductCard onDetails={() => setDetails("Aura Pour-Over Station")} />
                </AgentMessage>
              </div>
              <UserMessage now>
                Do you have copper kettles in stock for kitchen suite integration?
              </UserMessage>
              <AgentMessage named>
                <AgentText>
                  Yes! Our **Artisanal Hammered Copper Kettle** is currently in stock in limited
                  editions. Hand-spun with rapid induction conductivity and brushed walnut hardware.
                </AgentText>
                <ProductActions onAction={setDetails} />
              </AgentMessage>
              <UserMessage>I’d like to return an item from my order.</UserMessage>
              <AgentMessage named id="return-order">
                <VerifiedCard />
              </AgentMessage>
              <AgentMessage>
                <AgentText>Which item do you want to return?</AgentText>
                <ReturnItemCard
                  quantity={quantity}
                  onQuantity={setQuantity}
                  onReturn={() => jump("return-reason")}
                />
              </AgentMessage>
              <UserMessage>{`Gadget B × ${quantity}`}</UserMessage>
              <AgentMessage named id="return-reason">
                <AgentText>What went wrong?</AgentText>
                <ChoiceChips
                  options={[
                    "Damaged",
                    "Wrong item",
                    "Missing parts",
                    "Defective",
                    "Changed my mind",
                  ]}
                  selected={reason}
                  onSelect={(value) => {
                    setReason(value);
                    jump("return-photo");
                  }}
                />
                <p className="chips-note">Answered chips lock so old taps can’t change the flow</p>
              </AgentMessage>
              <UserMessage>{reason}</UserMessage>
              <AgentMessage id="return-photo">
                <AgentText>
                  Sorry about that. Add at least one photo of the damaged product.
                </AgentText>
                <PhotoCard onContinue={() => jump("return-outcome")} />
              </AgentMessage>
              <UserMessage>1 photo added</UserMessage>
              <AgentMessage named id="return-outcome">
                <AgentText>Choose your preferred outcome</AgentText>
                <ChoiceChips
                  options={["Refund INR 150", "Store credit", "Exchange"]}
                  selected={outcome}
                  onSelect={(value) => {
                    setOutcome(value);
                    jump("return-review");
                  }}
                />
              </AgentMessage>
              <UserMessage>{outcome}</UserMessage>
              <AgentMessage id="return-review">
                <ReviewCard
                  quantity={quantity}
                  reason={reason}
                  outcome={outcome}
                  onConfirm={() => {
                    setConfirmed(true);
                    setCancelled(false);
                    jump("return-ticket");
                  }}
                  onEdit={() => jump("return-reason")}
                  onCancel={() => {
                    setCancelled(true);
                    setConfirmed(false);
                  }}
                />
              </AgentMessage>
              {cancelled ? (
                <AgentMessage>
                  <AgentText>Your return request has been cancelled.</AgentText>
                </AgentMessage>
              ) : (
                confirmed && (
                  <>
                    <UserMessage>Confirm</UserMessage>
                    <AgentMessage named id="return-ticket">
                      <TicketCard
                        onStatus={() =>
                          reply(
                            "TKT–000004 is in review. Review within 24 hours. Pickup details will be sent by email.",
                          )
                        }
                        onAgent={agent}
                      />
                    </AgentMessage>
                    <AgentMessage>
                      <FeedbackCard onAgent={agent} />
                    </AgentMessage>
                  </>
                )
              )}
              {extras.map((item, index) =>
                item.user ? (
                  <UserMessage key={index}>{item.text}</UserMessage>
                ) : (
                  <AgentMessage named key={index}>
                    <AgentText>{item.text}</AgentText>
                  </AgentMessage>
                ),
              )}
              <div id="chat-end" />
            </ConversationContent>
          </Conversation>
          <footer className="widget-footer">
            <nav className="quick-actions quick-action" aria-label="Quick actions">
              {["Order status", "Return item", "Refund policy", "Talk to human agent"].map(
                (label) => (
                  <Button key={label} variant="chip" size="sm" onClick={() => quickAction(label)}>
                    {label}
                  </Button>
                ),
              )}
            </nav>
            <div className="composer-area">
              <PromptInput
                className="chat-composer"
                onSubmit={({ text }) => {
                  if (!text.trim()) return;
                  setExtras((previous) => [...previous, { text: text.trim(), user: true }]);
                  textarea.current?.focus();
                }}
              >
                <PromptInputTextarea
                  ref={textarea}
                  placeholder="Reply or ask anything…"
                  aria-label="Your message"
                />
                <PromptInputFooter className="composer-controls">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="camera-control"
                    type="button"
                    aria-label="Attach a photo"
                    title="Attach a photo"
                    onClick={() => upload.current?.click()}
                  >
                    <ImageIcon />
                  </Button>
                  <div className="send-controls">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label="Voice input"
                      title="Voice input"
                      onClick={() =>
                        reply(
                          "Voice input is not connected in this frontend preview. You can type your message instead.",
                        )
                      }
                    >
                      <Mic />
                    </Button>
                    <PromptInputSubmit variant="send" size="icon-sm" aria-label="Send message">
                      <ArrowRight />
                    </PromptInputSubmit>
                  </div>
                </PromptInputFooter>
              </PromptInput>
              <input
                ref={upload}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  if (event.target.files?.length) reply("Photo attached to this preview.");
                }}
              />
              <div className="powered-by">
                Powered by <strong>Vittain AI</strong>
                <span>·</span>Encrypted Spatial Returns
              </div>
            </div>
          </footer>
          {details && (
            <div className="detail-overlay">
              <div className="detail-panel">
                <Button
                  className="detail-close"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close details"
                  onClick={() => setDetails(null)}
                >
                  <X />
                </Button>
                <DetailCard title={details}>
                  {details === "Refund policy" ? (
                    <p>
                      Your verified order has 19 days left to return. Choose a refund, store credit,
                      or an exchange. Refunds follow review of your request.
                    </p>
                  ) : (
                    <>
                      <p>Hand-crafted materials. Considered details.</p>
                      <p>Explore the collection with your SIEXY concierge.</p>
                      <Button
                        onClick={() => {
                          setDetails(null);
                          reply(
                            `${details} selected. This is a frontend preview; showroom reservations and product services are not connected.`,
                          );
                        }}
                      >
                        Continue <ArrowRight />
                      </Button>
                    </>
                  )}
                </DetailCard>
              </div>
            </div>
          )}
        </section>
      )}
      <Button
        variant="send"
        className="widget-launcher"
        aria-label={open ? "Close concierge" : "Open concierge"}
        title={open ? "Close concierge" : "Open concierge"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <MessageCircle />}
        {!open && <i className="launcher-status" />}
      </Button>
    </>
  );
}
