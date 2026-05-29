import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type GroupId = string;

export type Group = {
  id: GroupId;
  name: string;
  subscriptionSenderIds: number[]; // sender IDs included in this group
  // Optional fallback list for name-based filtering when sender_id is unavailable
  subscriptionSenderNames?: string[];
};

type GroupsContextType = {
  groups: Group[]; // Does not include implicit "All"
  selectedGroupId: GroupId | 'all' | 'unread';
  setSelectedGroupId: (id: GroupId | 'all' | 'unread') => void;
  createGroup: (name: string, subscriptionSenderIds: number[], subscriptionSenderNames?: string[]) => void;
  updateGroup: (id: GroupId, updates: Partial<Omit<Group, 'id'>>) => void;
  deleteGroup: (id: GroupId) => void;
  reorderGroups: (orderedIds: GroupId[]) => void;
  resetAll: () => void;
};

const STORAGE_KEY = 'user.groups.v1';

const GroupsContext = createContext<GroupsContextType | undefined>(undefined);

function generateId(): GroupId {
  return `grp_${Math.random().toString(36).slice(2, 10)}`;
}

export const GroupsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId | 'all' | 'unread'>('all');
  const isHydratedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setGroups(parsed);
            }
          } catch {
            // Ignore invalid persisted data (e.g., if tests stub SecureStore with non-JSON)
          }
        }
      } finally {
        isHydratedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(groups)).catch(() => {});
  }, [groups]);

  const api = useMemo<GroupsContextType>(() => ({
    groups,
    selectedGroupId,
    setSelectedGroupId,
    createGroup: (name: string, subscriptionSenderIds: number[], subscriptionSenderNames?: string[]) => {
      const next: Group = { id: generateId(), name: name.trim() || 'Untitled', subscriptionSenderIds, subscriptionSenderNames };
      setGroups(current => [...current, next]);
      setSelectedGroupId(next.id);
    },
    updateGroup: (id: GroupId, updates: Partial<Omit<Group, 'id'>>) => {
      setGroups(current => current.map(g => (g.id === id ? { ...g, ...updates, name: updates.name?.trim() || g.name } : g)));
    },
    deleteGroup: (id: GroupId) => {
      setGroups(current => current.filter(g => g.id !== id));
      setSelectedGroupId('all');
    },
    reorderGroups: (orderedIds: GroupId[]) => {
      setGroups(current => {
        const idToGroup = new Map(current.map(g => [g.id, g] as const));
        const ordered: Group[] = [];
        orderedIds.forEach(id => {
          const g = idToGroup.get(id);
          if (g) ordered.push(g);
        });
        // Append any groups that were not included (defensive)
        current.forEach(g => { if (!orderedIds.includes(g.id)) ordered.push(g); });
        return ordered;
      });
    },
    resetAll: () => {
      setGroups([]);
      setSelectedGroupId('all');
    },
  }), [groups, selectedGroupId]);

  return (
    <GroupsContext.Provider value={api}>
      {children}
    </GroupsContext.Provider>
  );
};

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}


