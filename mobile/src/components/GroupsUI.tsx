import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { Group, GroupId, useGroups } from '../context/GroupsContext';
import { apiClient, Sender, getAuthToken } from '../api/client';

type EditGroupModalProps = {
  visible: boolean;
  onClose: () => void;
  initialGroup?: Group;
  onSubmit: (name: string, memberIds: number[], memberNames: string[]) => void;
};

const EditGroupModal = ({ visible, onClose, initialGroup, onSubmit }: EditGroupModalProps) => {
  const [name, setName] = useState(initialGroup?.name ?? '');
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialGroup?.subscriptionSenderIds ?? []));
  React.useEffect(() => {
    setName(initialGroup?.name ?? '');
    setSelectedIds(new Set(initialGroup?.subscriptionSenderIds ?? []));
  }, [initialGroup]);

  React.useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const token = await getAuthToken();
        const resp = await apiClient.get<Sender[]>('/api/senders', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setSenders(resp.data);
      } catch {
        setSenders([]);
      }
    })();
  }, [visible]);

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{initialGroup ? 'Edit Group' : 'New Group'}</Text>
          <TextInput
            placeholder="Group name"
            value={name}
            onChangeText={setName}
            style={styles.input}
            autoFocus
          />
          <Text style={styles.sectionTitle}>Subscriptions</Text>
          <View style={styles.memberListContainer}>
            <ScrollView style={{ maxHeight: 260 }}>
              {senders.map(s => (
                <TouchableOpacity key={s.id} style={styles.memberRow} onPress={() => toggle(s.id)}>
                  <View style={[styles.checkbox, selectedIds.has(s.id) && styles.checkboxActive]}>
                    {selectedIds.has(s.id) ? <Text style={styles.checkboxTick}>✓</Text> : null}
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.memberName}>{s.name}</Text>
                    <Text style={styles.memberEmail}>{s.email}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {senders.length === 0 ? (
                <Text style={styles.emptyText}>No subscriptions found.</Text>
              ) : null}
            </ScrollView>
          </View>
          <View style={styles.modalRow}>
            <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.primaryBtn]}
              onPress={() => {
                const memberNames = senders.filter(s => selectedIds.has(s.id)).map(s => s.name);
                onSubmit(name.trim(), Array.from(selectedIds), memberNames);
                onClose();
              }}
              disabled={!name.trim()}
            >
              <Text style={styles.primaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

type ReorderModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ReorderModal = ({ visible, onClose }: ReorderModalProps) => {
  const { groups, reorderGroups } = useGroups();
  const [order, setOrder] = useState<GroupId[]>(groups.map(g => g.id));
  React.useEffect(() => setOrder(groups.map(g => g.id)), [groups, visible]);

  const move = (index: number, dir: -1 | 1) => {
    setOrder(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Reorder Groups</Text>
          {order.length === 0 ? (
            <Text style={styles.emptyText}>No custom groups</Text>
          ) : (
            <View>
              {order.map((id, idx) => {
                const g = groups.find(x => x.id === id);
                if (!g) return null;
                return (
                  <View key={id} style={styles.reorderRow}>
                    <Text style={styles.reorderName}>{g.name}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => move(idx, -1)}>
                        <Ionicons name="chevron-up" size={18} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => move(idx, 1)}>
                        <Ionicons name="chevron-down" size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.modalRow}>
            <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.primaryBtn]}
              onPress={() => {
                reorderGroups(order);
                onClose();
              }}
            >
              <Text style={styles.primaryText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const GroupsRow = () => {
  const { groups, selectedGroupId, setSelectedGroupId, createGroup, updateGroup, deleteGroup } = useGroups();
  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Group | undefined>(undefined);
  const [reorderVisible, setReorderVisible] = useState(false);
  const [actionMenuFor, setActionMenuFor] = useState<Group | null>(null);

  // Prepend built-in chips: All and Unread (not reorderable)
  const chips = useMemo(
    () => [
      { id: 'all', name: 'All' },
      { id: 'unread', name: 'Unread' },
      ...groups,
    ] as Array<{ id: 'all' | 'unread' | GroupId; name: string }>,
    [groups]
  );

  const onLongPressGroup = (g: { id: 'all' | GroupId; name: string }) => {
    if (g.id === 'all' || g.id === 'unread') return; // no actions for All/Unread
    const group = groups.find(x => x.id === g.id);
    if (group) setActionMenuFor(group);
  };

  return (
    <View style={styles.strip}>
      <View style={styles.row}>
        <FlatList
          data={chips}
          keyExtractor={item => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          style={{ height: 30 }}
          ListFooterComponent={
            <TouchableOpacity
              style={[styles.chip, styles.addChip]}
              onPress={() => {
                setEditTarget(undefined); // ensure clean slate name
                setEditVisible(true);
              }}
            >
              <Ionicons name="add" size={16} color={colors.light.textPrimary} />
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.chip, selectedGroupId === item.id && styles.chipActive]}
              onPress={() => setSelectedGroupId(item.id as any)}
              onLongPress={() => onLongPressGroup(item)}
            >
              <Text style={[styles.chipText, selectedGroupId === item.id && styles.chipTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Create/Edit Modal */}
        <EditGroupModal
          visible={editVisible}
          initialGroup={editTarget}
          onClose={() => { setEditVisible(false); setEditTarget(undefined); }}
          onSubmit={(name, memberIds, memberNames) => {
            if (editTarget) {
              updateGroup(editTarget.id, { name, subscriptionSenderIds: memberIds, subscriptionSenderNames: memberNames });
            } else {
              createGroup(name, memberIds, memberNames);
            }
          }}
        />

        {/* Reorder available from action menu only; floating button removed */}

        <ReorderModal visible={reorderVisible} onClose={() => setReorderVisible(false)} />

        {/* Action Menu for long-press */}
        <Modal visible={!!actionMenuFor} transparent animationType="fade" onRequestClose={() => setActionMenuFor(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.menuCard}>
              <Text style={styles.menuTitle}>{actionMenuFor?.name}</Text>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (!actionMenuFor) return;
                  setEditTarget(actionMenuFor);
                  setActionMenuFor(null);
                  setEditVisible(true);
                }}
              >
                <Ionicons name="pencil" size={16} />
                <Text style={styles.menuItemText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setActionMenuFor(null);
                  setReorderVisible(true);
                }}
              >
                <Ionicons name="reorder-three" size={16} />
                <Text style={styles.menuItemText}>Reorder</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuDelete]}
                onPress={() => {
                  const target = actionMenuFor;
                  setActionMenuFor(null); // close menu
                  if (!target) return;
                  Alert.alert(
                    'Delete group?',
                    `You're about to delete the group "${target.name}". This will remove the group and its filter. Your subscriptions will not be changed.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(target.id) },
                    ]
                  );
                }}
              >
                <Ionicons name="trash" size={16} color="#E53E3E" />
                <Text style={[styles.menuItemText, { color: '#E53E3E' }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn, { alignSelf: 'flex-end' }]} onPress={() => setActionMenuFor(null)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    // Pull the strip up to touch the header's bottom edge
    marginTop: -8,
  },
  row: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#A0AEC0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.light.surface,
  },
  chipActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  chipText: {
    color: colors.light.textPrimary,
    fontSize: 13,
  },
  chipTextActive: {
    color: 'white',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 12,
    padding: 16,
    minWidth: 300,
  },
  menuCard: {
    backgroundColor: colors.light.surface,
    borderRadius: 12,
    padding: 12,
    minWidth: 240,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  menuItemText: {
    fontSize: 14,
    color: colors.light.textPrimary,
  },
  menuDelete: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 6,
    paddingTop: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  memberListContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  memberName: {
    fontSize: 14,
    color: colors.light.textPrimary,
  },
  memberEmail: {
    fontSize: 12,
    color: colors.light.textSecondary,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtn: {
    backgroundColor: colors.light.primary,
  },
  primaryText: {
    color: 'white',
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: '#EDF2F7',
  },
  cancelText: {
    color: colors.light.textPrimary,
  },
  emptyText: {
    color: colors.light.textSecondary,
    marginBottom: 12,
  },
  reorderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reorderName: {
    fontSize: 15,
  },
  iconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#A0AEC0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  checkboxTick: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Floating reorder removed
});

export default GroupsRow;


