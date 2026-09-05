"use client";

import {
  COFFEE_GROUP_ETHOS_MAX_LENGTH,
  type CoffeeGroupSynthesisItem,
} from "@localai/shared";
import {
  coffeeGroupAtmosphereImageUrl,
  coffeeGroupAtmosphereIsReady,
  coffeeGroupSynthesisActionLabel,
  coffeeGroupSynthesisIsInFlight,
  coffeeGroupSynthesisItemState,
  coffeeGroupSynthesisStatusLabel,
  type CoffeeGroupIdentitySnapshot,
} from "./coffeeGroupIdentity";
import styles from "./page.module.css";

interface CoffeeGroupIdentitySectionProps {
  group: CoffeeGroupIdentitySnapshot;
  nameDraft: string;
  ethosDraft: string;
  ethosDisabled: boolean;
  synthesisBusyItem: CoffeeGroupSynthesisItem | null;
  atmosphereImageFailed: boolean;
  onEthosChange: (value: string) => void;
  onEthosFocus: () => void;
  onEthosBlur: () => void;
  onSaveEthos: (value: string) => void;
  onSynthesize: (item: CoffeeGroupSynthesisItem) => void;
  onAtmosphereImageError: (imageId: string) => void;
}

const COFFEE_GROUP_SYNTHESIS_ITEMS = [
  "name",
  "ethos",
  "atmosphere",
] as const satisfies readonly CoffeeGroupSynthesisItem[];

const COFFEE_GROUP_SYNTHESIS_LABELS: Record<
  CoffeeGroupSynthesisItem,
  string
> = {
  name: "Name",
  ethos: "Ethos",
  atmosphere: "Atmosphere",
};

/** Compact editor and retry surface for the three parts of a Coffee Group identity. */
export function CoffeeGroupIdentitySection(
  props: CoffeeGroupIdentitySectionProps,
): React.JSX.Element {
  const atmosphere = props.group.atmosphere ?? null;
  const atmosphereReady =
    coffeeGroupAtmosphereIsReady(props.group) &&
    atmosphere !== null &&
    !props.atmosphereImageFailed;
  const ethosDirty =
    props.ethosDraft.trim() !== (props.group.ethos ?? "").trim();

  return (
    <section
      className={`${styles.coffeeGroupOverviewCard} ${styles.coffeeGroupIdentityCard}`}
      aria-labelledby="coffee-group-identity-title"
      data-coffee-group-identity="true"
    >
      <div className={styles.coffeeGroupIdentityHeading}>
        <h3 id="coffee-group-identity-title">Table identity</h3>
        <p>Quiet context that helps this table feel like itself.</p>
      </div>
      <div className={styles.coffeeGroupIdentityItems}>
        {COFFEE_GROUP_SYNTHESIS_ITEMS.map((item) => {
          const itemState = coffeeGroupSynthesisItemState(props.group, item);
          const inFlight = coffeeGroupSynthesisIsInFlight(props.group, item);
          const synthesisActionLabel = coffeeGroupSynthesisActionLabel(
            props.group,
            item,
          );
          const actionLabel =
            item === "ethos" && ethosDirty ? "Save" : synthesisActionLabel;
          const statusLabel =
            item === "ethos" && ethosDirty
              ? "Unsaved"
              : itemState === null && synthesisActionLabel === "Regenerate"
              ? "Ready"
              : coffeeGroupSynthesisStatusLabel(itemState);
          const buttonDisabled =
            inFlight ||
            props.synthesisBusyItem !== null ||
            (item === "ethos" && props.ethosDisabled);

          return (
            <div
              key={item}
              className={styles.coffeeGroupIdentityItem}
              data-coffee-group-synthesis-item={item}
              data-synthesis-status={itemState?.status ?? "legacy"}
            >
              <div className={styles.coffeeGroupIdentityItemHeader}>
                <strong>{COFFEE_GROUP_SYNTHESIS_LABELS[item]}</strong>
                <span
                  className={styles.coffeeGroupIdentityStatus}
                  data-status={itemState?.status ?? "legacy"}
                  role="status"
                >
                  {statusLabel}
                </span>
              </div>

              {item === "name" ? (
                <div className={styles.coffeeGroupIdentityValue}>
                  <span>{props.nameDraft || props.group.name}</span>
                  <small>Edit the group title above.</small>
                </div>
              ) : item === "ethos" ? (
                <label className={styles.coffeeGroupEthosField}>
                  <span className={styles.srOnly}>Coffee Group ethos</span>
                  <textarea
                    value={props.ethosDraft}
                    maxLength={COFFEE_GROUP_ETHOS_MAX_LENGTH}
                    rows={2}
                    disabled={props.ethosDisabled}
                    placeholder="Why this table chooses to gather."
                    onChange={(event) =>
                      props.onEthosChange(event.currentTarget.value)
                    }
                    onFocus={props.onEthosFocus}
                    onBlur={props.onEthosBlur}
                    data-coffee-group-ethos-input="true"
                  />
                  <small>
                    One quiet sentence of context—not a recurring topic.{" "}
                    {props.ethosDraft.length}/{COFFEE_GROUP_ETHOS_MAX_LENGTH}
                  </small>
                </label>
              ) : (
                <div className={styles.coffeeGroupAtmospherePreview}>
                  {atmosphereReady && atmosphere ? (
                    // The authenticated image endpoint is intentionally not sent through Next's optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coffeeGroupAtmosphereImageUrl(atmosphere.imageId)}
                      alt=""
                      aria-hidden="true"
                      onError={() =>
                        props.onAtmosphereImageError(atmosphere.imageId)
                      }
                      data-coffee-group-atmosphere-preview="true"
                    />
                  ) : (
                    <span aria-hidden="true">◇</span>
                  )}
                  <small>
                    {atmosphereReady
                      ? "Ready behind the Coffee table."
                      : "A character-free room for this table."}
                  </small>
                </div>
              )}

              <button
                type="button"
                className={styles.coffeeGroupIdentityAction}
                disabled={buttonDisabled}
                onClick={() => {
                  if (item === "ethos" && ethosDirty) {
                    props.onSaveEthos(props.ethosDraft);
                    return;
                  }
                  props.onSynthesize(item);
                }}
                title={
                  item === "ethos" && ethosDirty
                    ? "Save this table ethos"
                    : itemState?.error
                }
                data-coffee-group-synthesis-action={item}
              >
                {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
