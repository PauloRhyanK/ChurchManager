import type { ProjectionTopic } from "@/features/site/api/projection-api";

/** Tópico em edição; `key` é só local (tópico novo ainda não tem id). */
export type TopicDraft = ProjectionTopic & { key: string };

let nextKey = 0;

export function toTopicDraft(topic: ProjectionTopic): TopicDraft {
  return { ...topic, key: topic.id ?? `novo-${++nextKey}` };
}

export function isTopicIncomplete(topic: ProjectionTopic) {
  return !topic.title.trim() || !topic.text.trim();
}
