import React, { lazy, Suspense, useCallback, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged, signOut, auth } from './lib/localAuth';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, writeBatch, setDoc, getDocs, query, where, db } from './lib/localData';
import { formatDate } from './lib/locale';
import { nowMs } from './lib/time';
import {
  createProjectActivityData,
  PROJECT_ACTIVITY_TYPES,
} from './lib/activityDomain';
import {
  createProjectArchivePatch,
  createRecentProjectIdsPatch,
  normalizePinnedProjectIds,
  normalizeRecentProjectIds,
} from './lib/dashboardDomain';
import {
  createBookingPatch,
  createBookingConfigData,
  createBookingReleasePatch,
  createBookingWaitlistPatch,
  createGatherFieldData,
  createGatherSubmissionData,
  createProjectCascadeDeleteOperations,
  createProjectBriefPatch,
  createProjectCreateData,
  createProjectDuplicateChildOperations,
  createProjectDuplicateData,
  commitProjectDuplicateWithRollback,
  createQueueJoinData,
  createQueueResultData,
  createRouletteJoinData,
  createRouletteResultData,
  createScheduleConfigData,
  createScheduleSubmissionWrite,
  createTeamJoinMember,
  createVoteToggleOperations,
  createClaimToggleData,
  createProjectStatusPatch,
  normalizeProjectChildText,
  PROJECT_CASCADE_COLLECTIONS,
} from './lib/projectDomain';
import {
  createClearReadNotificationOperations,
  createMarkNotificationReadOperation,
  createMarkNotificationsReadOperations,
} from './lib/notificationDomain';
import { TRANSLATIONS } from './constants/translations';
import { LogOut, Shield, Bell, Users, X } from './components/Icons';
import AtmostfairLogo from './components/Logo';
import { UIProvider } from './components/UIComponents';
import AnnouncementSystem from './components/AnnouncementSystem';
import FriendSystem from './components/FriendSystem';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

const LOCKED_PROJECT_STATUSES = new Set(['stopped', 'finished']);

const RouteLoadingFallback = ({ label }) => (
  <div className="flex min-h-[320px] w-full items-center justify-center px-4">
    <div className="app-card px-6 py-4 text-sm font-medium text-m3-on-surface-variant">{label}</div>
  </div>
);

// Page Transition Wrapper
const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ duration: 0.3, ease: "anticipate" }}
    className="w-full h-full"
  >
    {children}
  </motion.div>
);

function AppContent() {
  const location = useLocation();
  const [lang, setLang] = useState(localStorage.getItem('app_lang') || 'zh');
  const t = useCallback((key, params = {}) => {
    let str = TRANSLATIONS[lang]?.[key] || key;
    if (typeof str !== 'string') return str;
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp(`{${k}}`, 'g'), params[k]);
    });
    return str;
  }, [lang]);

  const toggleLang = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  // ADMIN CONFIGURATION
  const ADMIN_EMAILS = ['quaternijkon@mail.ustc.edu.cn'];
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdmin = user && (ADMIN_EMAILS.includes(user.email) || ADMIN_EMAILS.length === 0);

  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rouletteParticipants, setRouletteParticipants] = useState([]);
  const [queueParticipants, setQueueParticipants] = useState([]);
  const [gatherFields, setGatherFields] = useState([]);
  const [gatherSubmissions, setGatherSubmissions] = useState([]);
  const [scheduleSubmissions, setScheduleSubmissions] = useState([]);
  const [bookingSlots, setBookingSlots] = useState([]);
  const [claimItems, setClaimItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [projectActivities, setProjectActivities] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [showFriends, setShowFriends] = useState(false);
  const currentUserName = () => user?.displayName || user?.email?.split('@')[0] || t('anonymousUser');
  const pinnedProjectIds = normalizePinnedProjectIds(userProfile?.pinnedProjectIds);
  const recentProjectIds = normalizeRecentProjectIds(userProfile?.recentProjectIds);
  const isProjectWritable = (projectId) => {
    const project = projects.find((entry) => entry.id === projectId);
    return Boolean(project && !project.archived && !LOCKED_PROJECT_STATUSES.has(project.status));
  };
  const requireProjectWritable = (projectId, showToast) => {
    if (isProjectWritable(projectId)) return true;
    showToast(t('projectReadOnly'), 'info');
    return false;
  };

  const loadProjectCascadeDocs = async (projectId) => {
    const docsByCollection = {
      projects: projects.filter((project) => project.id === projectId),
    };

    await Promise.all(
      PROJECT_CASCADE_COLLECTIONS
        .filter(({ name }) => name !== 'projects')
        .map(async ({ name, field }) => {
          const snapshot = await getDocs(query(collection(db, name), where(field, '==', projectId)));
          docsByCollection[name] = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        }),
    );

    return docsByCollection;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setUserProfile(null);
      setProjectsLoaded(false);
      setAuthChecking(false);
      if (u) {
          try {
             await setDoc(doc(db, 'users', u.uid), {
                 uid: u.uid,
                 email: u.email,
                 displayName: u.displayName || u.email?.split('@')[0] || t('anonymousUser'),
                 createdAt: u.metadata.creationTime,
                 lastSeen: nowMs()
             }, { merge: true });
          } catch (e) { console.error("Error syncing user profile", e); }
      }
    });
    return () => unsubscribe();
  }, [t]);

  // Data Sync
  useEffect(() => {
    if (!user) return;
    const unsubUserProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setUserProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    });
    const unsubProjects = onSnapshot(collection(db, 'projects'), (s) => {
      setProjects(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)));
      setProjectsLoaded(true);
    });
    const unsubItems = onSnapshot(collection(db, 'voting_items'), (s) => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (s) => setRooms(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubRoulette = onSnapshot(collection(db, 'roulette_participants'), (s) => setRouletteParticipants(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubQueue = onSnapshot(collection(db, 'queue_participants'), (s) => setQueueParticipants(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGatherFields = onSnapshot(collection(db, 'gather_fields'), (s) => setGatherFields(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGatherSubmissions = onSnapshot(collection(db, 'gather_submissions'), (s) => setGatherSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubScheduleSubmissions = onSnapshot(collection(db, 'schedule_submissions'), (s) => setScheduleSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBookingSlots = onSnapshot(collection(db, 'booking_slots'), (s) => setBookingSlots(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubClaimItems = onSnapshot(collection(db, 'claim_items'), (s) => setClaimItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (s) => setNotifications(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.recipientId === user.uid).sort((a,b)=>b.createdAt-a.createdAt)));
    const unsubProjectActivities = onSnapshot(collection(db, 'project_activities'), (s) => setProjectActivities(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0))));
    return () => { unsubUserProfile(); unsubProjects(); unsubItems(); unsubRooms(); unsubRoulette(); unsubQueue(); unsubGatherFields(); unsubGatherSubmissions(); unsubScheduleSubmissions(); unsubBookingSlots(); unsubClaimItems(); unsubNotifications(); unsubProjectActivities(); };
  }, [user]);

  const recordProjectActivity = async ({ projectId, type, subject, metadata, actorName }) => {
    const activity = createProjectActivityData({
      projectId,
      type,
      actor: user,
      actorName: actorName || currentUserName(),
      subject,
      metadata,
      createdAt: nowMs(),
    });
    if (!activity) return;
    try {
      await addDoc(collection(db, 'project_activities'), activity);
    } catch (error) {
      console.error('Error recording project activity', error);
    }
  };

  // Actions
  const createActions = (showToast) => ({
      handleAddItem: async (title, projectId, creatorName) => {
        const cleanTitle = normalizeProjectChildText(title);
        if (!cleanTitle || !user || !requireProjectWritable(projectId, showToast)) return;
        await addDoc(collection(db, 'voting_items'), { title: cleanTitle, projectId, creatorId: user.uid, creatorName: creatorName || currentUserName(), votes: [], createdAt: nowMs() });
        void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.voteItemAdded, subject: cleanTitle, actorName: creatorName });
      },
      handleDeleteItem: async (itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        if (!item || !requireProjectWritable(item.projectId, showToast)) return;
        await deleteDoc(doc(db, 'voting_items', itemId));
      },
      handleVote: async (staleItem, votingConfig) => {
         if (!user) return;
         const item = items.find((entry) => entry.id === staleItem?.id);
         if (!item || !requireProjectWritable(item.projectId, showToast)) return;
         const voteOperations = createVoteToggleOperations(items, item, user, votingConfig);
         if (voteOperations.length === 0) return;
         const batch = writeBatch(db);
         voteOperations.forEach((operation) => {
            batch.update(doc(db, operation.collection, operation.id), {
              votes: operation.action === 'removeVote' ? arrayRemove(operation.uid) : arrayUnion(operation.uid),
            });
         });
         await batch.commit();
         void recordProjectActivity({ projectId: item.projectId, type: PROJECT_ACTIVITY_TYPES.voteToggled, subject: item.title });
      },
      handleUpdateVotingConfig: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         await updateDoc(doc(db, 'projects', projectId), { votingConfig: config });
      },
      handleCreateRoom: async (name, maxMembers, projectId, creatorName) => {
         const cleanName = normalizeProjectChildText(name);
         if (!user || !cleanName || !requireProjectWritable(projectId, showToast)) return;
         await addDoc(collection(db, 'rooms'), { name: cleanName, projectId, ownerId: user.uid, maxMembers: parseInt(maxMembers)||4, members: [{ uid: user.uid, name: creatorName || currentUserName(), joinedAt: nowMs() }], createdAt: nowMs() });
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.teamCreated, subject: cleanName, actorName: creatorName });
      },
      handleJoinRoom: async (roomId, userName) => {
         if (!user) return;
         const room = rooms.find((entry) => entry.id === roomId);
         if (!room || !requireProjectWritable(room.projectId, showToast)) return;
         const member = createTeamJoinMember(room, user, userName || currentUserName(), nowMs());
         if (!member) return;
         await updateDoc(doc(db, 'rooms', roomId), { members: arrayUnion(member) });
         void recordProjectActivity({ projectId: room.projectId, type: PROJECT_ACTIVITY_TYPES.teamJoined, subject: room.name, actorName: member.name });
      },
      handleKickMember: async (roomId, memberObject) => {
        const room = rooms.find((entry) => entry.id === roomId);
        if (!room || !requireProjectWritable(room.projectId, showToast)) return;
        await updateDoc(doc(db, 'rooms', roomId), { members: arrayRemove(memberObject) });
        if (room) void recordProjectActivity({ projectId: room.projectId, type: PROJECT_ACTIVITY_TYPES.teamMemberRemoved, subject: memberObject?.name || room.name });
      },
      handleDeleteRoom: async (roomId) => {
        const room = rooms.find((entry) => entry.id === roomId);
        if (!room || !requireProjectWritable(room.projectId, showToast)) return;
        await deleteDoc(doc(db, 'rooms', roomId));
      },
      handleJoinQueue: async (projectId, userName, value) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const participant = createQueueJoinData(queueParticipants, projectId, user, userName || currentUserName(), value, nowMs());
         if (!participant) return;
         await addDoc(collection(db, 'queue_participants'), participant);
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.queueJoined, subject: participant.name, metadata: { value: participant.value }, actorName: participant.name });
      },
      handleGenerateQueue: async (projectId) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const parts = queueParticipants.filter(p => p.projectId === projectId);
         const queueResult = createQueueResultData(parts, nowMs());
         if (!queueResult) return;
         
         const batch = writeBatch(db);
         queueResult.updates.forEach(u => {
            const ref = doc(db, 'queue_participants', u.id);
            batch.update(ref, { queueOrder: u.queueOrder });
         });
         const projectRef = doc(db, 'projects', projectId);
         batch.update(projectRef, { status: 'finished', queueResult: queueResult });
         
         await batch.commit();
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.queueGenerated, subject: String(queueResult.participantCount), metadata: { participantCount: queueResult.participantCount } });
      },
      handleJoinRoulette: async (projectId, userName, value) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const participant = createRouletteJoinData(rouletteParticipants, projectId, user, userName || currentUserName(), value, nowMs());
         if (!participant) return;
         await addDoc(collection(db, 'roulette_participants'), participant);
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.rouletteJoined, subject: participant.name, metadata: { value: participant.value }, actorName: participant.name });
      },
      handleUpdateRouletteConfig: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         await updateDoc(doc(db, 'projects', projectId), { rouletteConfig: config });
      },
      handleSaveRouletteResult: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const parts = rouletteParticipants.filter(p => p.projectId === projectId);
         const rouletteResult = createRouletteResultData(parts, config, nowMs());
         if (!rouletteResult) return;

         const batch = writeBatch(db);
         const projectRef = doc(db, 'projects', projectId);
         batch.update(projectRef, { rouletteResult: rouletteResult, status: 'finished' });
         rouletteResult.winnerUpdates.forEach((winnerUpdate) => {
            batch.update(doc(db, 'roulette_participants', winnerUpdate.id), { isWinner: winnerUpdate.isWinner });
         });

         await batch.commit();
         void recordProjectActivity({
            projectId,
            type: PROJECT_ACTIVITY_TYPES.rouletteDrawn,
            subject: rouletteResult.winners.map((winner) => winner.name).join(', '),
            metadata: { participantCount: rouletteResult.participantCount, winnerCount: rouletteResult.winners.length },
         });
      },
      handleRecordWinner: async (projectId, winnerInfo) => {
         if (!requireProjectWritable(projectId, showToast)) return;
         await updateDoc(doc(db, 'projects', projectId), { winners: arrayUnion({ ...winnerInfo, wonAt: nowMs() }), status: 'finished' });
         if (winnerInfo.participantId) await updateDoc(doc(db, 'roulette_participants', winnerInfo.participantId), { isWinner: true });
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.winnerRecorded, subject: winnerInfo.name || winnerInfo.title || winnerInfo.participantId || '' });
      },
      handleToggleProjectStatus: async (project) => {
        const patch = createProjectStatusPatch(project, user, isAdmin);
        if (!patch) return;
        await updateDoc(doc(db, 'projects', project.id), patch);
        void recordProjectActivity({
          projectId: project.id,
          type: patch.status === 'stopped' ? PROJECT_ACTIVITY_TYPES.projectPaused : PROJECT_ACTIVITY_TYPES.projectResumed,
          subject: project.title,
        });
      },
      handleDeleteProject: async (projectId) => {
        const docsByCollection = await loadProjectCascadeDocs(projectId);
        const operations = createProjectCascadeDeleteOperations(projectId, docsByCollection);
        const batch = writeBatch(db);
        operations.forEach((operation) => {
          batch.delete(doc(db, operation.collection, operation.id));
        });
        await batch.commit();
      },
      handleDuplicateProject: async (project, titleSuffix = t('copySuffix')) => {
        if (!user || !project?.id) return null;
        if (project.creatorId !== user.uid && !isAdmin) return null;
        const duplicatedAt = nowMs();
        const projectData = createProjectDuplicateData(project, user, currentUserName(), duplicatedAt, titleSuffix);
        if (!projectData) return null;
        const projectRef = await commitProjectDuplicateWithRollback({
          db,
          collection,
          addDoc,
          deleteDoc,
          projectData,
          createChildOperations: (projectRef) => createProjectDuplicateChildOperations(
            projectRef.id,
            {
              voting_items: items.filter((item) => item.projectId === project.id),
              rooms: rooms.filter((room) => room.projectId === project.id),
              gather_fields: gatherFields.filter((field) => field.projectId === project.id),
              booking_slots: bookingSlots.filter((slot) => slot.projectId === project.id),
              claim_items: claimItems.filter((item) => item.projectId === project.id),
            },
            user,
            currentUserName(),
            duplicatedAt,
          ),
        });
        void recordProjectActivity({ projectId: project.id, type: PROJECT_ACTIVITY_TYPES.projectDuplicated, subject: projectData.title });
        void recordProjectActivity({ projectId: projectRef.id, type: PROJECT_ACTIVITY_TYPES.projectCreated, subject: projectData.title });
        return projectRef.id;
      },
      handleArchiveProject: async (project, archived) => {
        if (!user || !project?.id) return;
        if (project.creatorId !== user.uid && !isAdmin) return;
        const patch = createProjectArchivePatch(project, archived, nowMs());
        if (!patch) return;
        await updateDoc(doc(db, 'projects', project.id), patch);
        void recordProjectActivity({
          projectId: project.id,
          type: archived ? PROJECT_ACTIVITY_TYPES.projectArchived : PROJECT_ACTIVITY_TYPES.projectRestored,
          subject: project.title,
        });
      },
      handleUpdateProjectBrief: async (project, brief) => {
        const patch = createProjectBriefPatch(project, user, isAdmin, brief, nowMs());
        if (!patch) return false;
        await updateDoc(doc(db, 'projects', project.id), patch);
        void recordProjectActivity({
          projectId: project.id,
          type: PROJECT_ACTIVITY_TYPES.projectBriefUpdated,
          subject: t('projectBrief'),
        });
        return true;
      },
      handleCreateGatherField: async (projectId, label, type, options) => {
        if (!user || !requireProjectWritable(projectId, showToast)) return;
        const field = createGatherFieldData(projectId, user, label, type, options, nowMs());
        if (!field) return;
        await addDoc(collection(db, 'gather_fields'), field);
        void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.gatherFieldCreated, subject: field.label });
      },
      handleDeleteGatherField: async (fieldId) => {
        if (!user) return;
        const field = gatherFields.find((entry) => entry.id === fieldId);
        if (!field || !requireProjectWritable(field.projectId, showToast)) return;
        await deleteDoc(doc(db, 'gather_fields', fieldId));
      },
      handleSubmitGather: async (projectId, data, submitterName) => {
        if (!user || !requireProjectWritable(projectId, showToast)) return;
        const projectFields = gatherFields.filter((field) => field.projectId === projectId);
        const submission = createGatherSubmissionData(gatherSubmissions, projectId, user, submitterName || currentUserName(), data, nowMs(), projectFields);
        if (!submission) return;
        await addDoc(collection(db, 'gather_submissions'), submission);
        void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.gatherSubmitted, subject: submission.name, actorName: submission.name });
      },
      handleUpdateScheduleConfig: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const scheduleConfig = createScheduleConfigData(config);
         if (!scheduleConfig) return;
         await updateDoc(doc(db, 'projects', projectId), { scheduleConfig });
      },
      handleSubmitSchedule: async (projectId, availability, submitterName) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const project = projects.find((entry) => entry.id === projectId);
         const submissionWrite = createScheduleSubmissionWrite(scheduleSubmissions, projectId, user, submitterName || currentUserName(), availability, nowMs(), project?.scheduleConfig);
         if (!submissionWrite) return;
         if (submissionWrite.type === 'update') {
             await updateDoc(doc(db, submissionWrite.collection, submissionWrite.id), submissionWrite.data);
         } else {
             await addDoc(collection(db, submissionWrite.collection), submissionWrite.data);
         }
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.scheduleSubmitted, subject: submitterName || currentUserName() });
      },
      handleUpdateBookingConfig: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const bookingConfig = createBookingConfigData(config);
         if (!bookingConfig) return;
         await updateDoc(doc(db, 'projects', projectId), { bookingConfig });
      },
      handleCreateBookingSlot: async (projectId, start, end, label) => {
         const cleanLabel = normalizeProjectChildText(label);
         if (!cleanLabel) return;
         if (!requireProjectWritable(projectId, showToast)) return;
         // Create a slot doc. If already exists (somehow), ignore or valid. Ideally use unique combination as ID or random.
         // Let's use random ID for slots to allow multiple same-time slots if needed (abstractions).
         await addDoc(collection(db, 'booking_slots'), { projectId, start, end, label: cleanLabel, bookedBy: null, waitlist: [], createdAt: nowMs() });
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.bookingSlotCreated, subject: cleanLabel });
      },
      handleDeleteBookingSlot: async (slotId) => {
         const slot = bookingSlots.find((entry) => entry.id === slotId);
         if (!slot || !requireProjectWritable(slot.projectId, showToast)) return;
         await deleteDoc(doc(db, 'booking_slots', slotId));
      },
      handleBookSlot: async (slotId, bookingData) => {
         if (!user) return;
         const slot = bookingSlots.find((entry) => entry.id === slotId);
         if (!slot || !requireProjectWritable(slot.projectId, showToast)) return;
         const patch = createBookingPatch(slot, user, currentUserName(), bookingData, nowMs());
         if (!patch) return;
         await updateDoc(doc(db, 'booking_slots', slotId), patch);
         void recordProjectActivity({ projectId: slot.projectId, type: PROJECT_ACTIVITY_TYPES.bookingBooked, subject: slot.label || `${slot.start || ''} ${slot.end || ''}` });
      },
      handleToggleBookingWaitlist: async (slotId, bookingData = {}) => {
         if (!user) return null;
         const slot = bookingSlots.find((entry) => entry.id === slotId);
         if (!slot || !requireProjectWritable(slot.projectId, showToast)) return null;
         const waitlistPatch = createBookingWaitlistPatch(slot, user, currentUserName(), bookingData, nowMs());
         if (!waitlistPatch) return null;
         await updateDoc(doc(db, 'booking_slots', slotId), { waitlist: waitlistPatch.waitlist });
         return waitlistPatch;
      },
      handleKickUser: async (slotId, recipientId, projectId, reason) => {
         if (!user) return;
         const slot = bookingSlots.find((entry) => entry.id === slotId);
         if (!slot || !requireProjectWritable(slot.projectId, showToast)) return;
         const release = createBookingReleasePatch(slot, nowMs());
         if (!release) return;
         await updateDoc(doc(db, 'booking_slots', slotId), release.patch);
         await addDoc(collection(db, 'notifications'), { recipientId, type: 'kicked', title: t('bookingCancelled'), message: reason, projectId, read: false, createdAt: nowMs() });
         if (release.promoted?.uid) {
            await addDoc(collection(db, 'notifications'), {
              recipientId: release.promoted.uid,
              type: 'booking_promoted',
              title: t('waitlistPromoted'),
              message: slot?.label || `${slot?.start || ''} ${slot?.end || ''}`.trim(),
              projectId,
              read: false,
              createdAt: nowMs(),
            });
            void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.bookingBooked, subject: release.promoted.name || release.promoted.uid });
         }
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.bookingCancelled, subject: reason || recipientId });
      },
      handleReadNotification: async (nId) => {
        const operation = createMarkNotificationReadOperation(notifications, nId);
        if (!operation) return;
        await updateDoc(doc(db, operation.collection, operation.id), operation.data);
      },
      handleMarkAllNotificationsRead: async () => {
        const operations = createMarkNotificationsReadOperations(notifications);
        if (operations.length === 0) return;
        const batch = writeBatch(db);
        operations.forEach((operation) => {
          batch.update(doc(db, operation.collection, operation.id), operation.data);
        });
        await batch.commit();
      },
      handleClearReadNotifications: async () => {
        const operations = createClearReadNotificationOperations(notifications);
        if (operations.length === 0) return;
        const batch = writeBatch(db);
        operations.forEach((operation) => {
          batch.delete(doc(db, operation.collection, operation.id));
        });
        await batch.commit();
      },
      handleCreateClaimItem: async (projectId, title, maxClaims) => {
         const cleanTitle = normalizeProjectChildText(title);
         if (!user || !cleanTitle || !requireProjectWritable(projectId, showToast)) return;
         await addDoc(collection(db, 'claim_items'), { projectId, title: cleanTitle, maxClaims: parseInt(maxClaims)||1, claimants: [], creatorId: user.uid, creatorName: currentUserName(), createdAt: nowMs() });
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.claimCreated, subject: cleanTitle });
      },
      handleDeleteClaimItem: async (itemId) => {
         const item = claimItems.find((entry) => entry.id === itemId);
         if (!item || !requireProjectWritable(item.projectId, showToast)) return;
         await deleteDoc(doc(db, 'claim_items', itemId));
      },
      handleToggleClaim: async (claimItem, userName) => {
         if (!user) return;
         const item = claimItems.find((entry) => entry.id === claimItem?.id);
         if (!item || !requireProjectWritable(item.projectId, showToast)) return;
         const ref = doc(db, 'claim_items', item.id);
         const claimWrite = createClaimToggleData(item, user, userName || currentUserName(), nowMs());
         if (!claimWrite) return;
         await updateDoc(ref, {
           claimants: claimWrite.type === 'remove' ? arrayRemove(claimWrite.claimant) : arrayUnion(claimWrite.claimant),
         });
         void recordProjectActivity({
           projectId: item.projectId,
           type: claimWrite.type === 'remove' ? PROJECT_ACTIVITY_TYPES.claimDropped : PROJECT_ACTIVITY_TYPES.claimTaken,
           subject: item.title,
           actorName: userName || currentUserName(),
         });
      },
      handleToggleProjectPin: async (projectId) => {
        const cleanProjectId = String(projectId || '').trim();
        if (!user || !cleanProjectId || !projects.some((project) => project.id === cleanProjectId)) return;
        const nextPinnedProjectIds = pinnedProjectIds.includes(cleanProjectId)
          ? pinnedProjectIds.filter((entry) => entry !== cleanProjectId)
          : [cleanProjectId, ...pinnedProjectIds].slice(0, 100);
        const previousPinnedProjectIds = pinnedProjectIds;
        setUserProfile((current) => ({ ...(current || {}), pinnedProjectIds: nextPinnedProjectIds }));
        try {
          await setDoc(doc(db, 'users', user.uid), { pinnedProjectIds: nextPinnedProjectIds }, { merge: true });
        } catch (error) {
          setUserProfile((current) => ({ ...(current || {}), pinnedProjectIds: previousPinnedProjectIds }));
          console.error('Error updating project pins', error);
        }
      },
      handleRecordProjectOpen: async (projectId) => {
        const cleanProjectId = String(projectId || '').trim();
        if (!user || !cleanProjectId || !projects.some((project) => project.id === cleanProjectId)) return;
        const patch = createRecentProjectIdsPatch(cleanProjectId, recentProjectIds, 100);
        if (!patch) return;
        const previousRecentProjectIds = recentProjectIds;
        const nextRecentProjectIds = patch.recentProjectIds;
        setUserProfile((current) => ({ ...(current || {}), recentProjectIds: nextRecentProjectIds }));
        try {
          await setDoc(doc(db, 'users', user.uid), { recentProjectIds: nextRecentProjectIds }, { merge: true });
        } catch (error) {
          setUserProfile((current) => ({ ...(current || {}), recentProjectIds: previousRecentProjectIds }));
          console.error('Error updating recent projects', error);
        }
      }
  });

  const handleCreateProject = async (title, type, creatorName, password, showToast) => {
    const projectData = createProjectCreateData(title, type, user, creatorName, password, nowMs());
    if (!projectData) {
      showToast(t('createProjectFailed'), 'error');
      return { ok: false };
    }
    try {
      const projectRef = await addDoc(collection(db, 'projects'), projectData);
      void recordProjectActivity({ projectId: projectRef.id, type: PROJECT_ACTIVITY_TYPES.projectCreated, subject: projectData.title, actorName: projectData.creatorName });
      showToast(t('createProjectSuccess', { title: projectData.title }), 'success');
      return { ok: true, projectId: projectRef.id };
    } catch (e) {
      console.error(e);
      showToast(t('createProjectFailed'), 'error');
      return { ok: false };
    }
  };

  if (authChecking) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="app-card px-6 py-4 text-sm font-medium text-m3-on-surface-variant">{t('loading')}</div>
      </div>
    );
  }

  return (
      <UIProvider t={t}>
        {({ showToast }) => {
          const actions = createActions(showToast);
          return !user ? (
          <Suspense fallback={<RouteLoadingFallback label={t('loading')} />}>
            <Login lang={lang} setLang={setLang} t={t} />
          </Suspense>
        ) : (
          <div className="app-shell">
            <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
            <nav className="app-topbar">
              <div className="app-topbar-inner">
                <Link to="/" className="touch-target flex items-center gap-2 rounded-full px-2 transition-opacity hover:opacity-80" aria-label="Atmostfair">
                  <AtmostfairLogo className="text-2xl" />
                </Link>
                <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={toggleLang} className="app-button-quiet px-3 text-xs sm:text-sm">{t('switchLang')}</button>
                
                <AnnouncementSystem t={t} />
                
                <button 
                  onClick={() => setShowFriends(true)} 
                  className="app-icon-button relative"
                  title={t('friends')}
                >
                  <Users className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {showFriends && <FriendSystem user={user} onClose={() => setShowFriends(false)} t={t} />}
                </AnimatePresence>

                {/* Notifications & Mailbox */}
                <div className="relative">
                     <button onClick={() => setShowNotifications(!showNotifications)} className="app-icon-button relative" title={t('notifications')}>
                        <Bell className="w-5 h-5" />
                        {notifications.some(n => !n.read) && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-google-red"></span>}
                     </button>
                     {showNotifications && (
                         <div className="app-card absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden">
                             <div className="border-b border-m3-outline-variant/30 p-3">
                                 <div className="mb-2 text-sm font-medium">{t('notifications')}</div>
                                 <div className="grid grid-cols-2 gap-2">
                                     <button
                                       type="button"
                                       onClick={actions.handleMarkAllNotificationsRead}
                                       disabled={!notifications.some(n => !n.read)}
                                       className="rounded-full border border-m3-outline-variant/60 px-2 py-1.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:border-google-blue/40 hover:bg-google-blue/5 hover:text-google-blue disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-m3-outline-variant/60 disabled:hover:bg-transparent disabled:hover:text-m3-on-surface-variant"
                                     >
                                       {t('markAllRead')}
                                     </button>
                                     <button
                                       type="button"
                                       onClick={actions.handleClearReadNotifications}
                                       disabled={!notifications.some(n => n.read)}
                                       className="rounded-full border border-m3-outline-variant/60 px-2 py-1.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:border-google-blue/40 hover:bg-google-blue/5 hover:text-google-blue disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-m3-outline-variant/60 disabled:hover:bg-transparent disabled:hover:text-m3-on-surface-variant"
                                     >
                                       {t('clearRead')}
                                     </button>
                                 </div>
                             </div>
                             <div className="max-h-64 overflow-y-auto">
                                 {notifications.length === 0 ? (
                                     <div className="p-4 text-center text-xs text-m3-on-surface-variant">{t('noNotifications')}</div>
                                 ) : (
                                     notifications.map(n => (
                                         <button key={n.id} onClick={() => actions.handleReadNotification(n.id)} className={`w-full border-b border-m3-outline-variant/20 p-3 text-left transition-colors hover:bg-google-blue/5 ${n.read ? 'opacity-65' : 'bg-google-blue/5'}`}>
                                             <div className="text-sm font-medium mb-1">{n.title}</div>
                                             <div className="text-xs text-m3-on-surface-variant">{n.message}</div>
                                             <div className="text-[10px] text-m3-on-surface-variant/60 mt-1 text-right">{formatDate(n.createdAt, t)}</div>
                                         </button>
                                     ))
                                 )}
                             </div>
                         </div>
                     )}
                </div>

                {isAdmin && (
                  <button onClick={() => setShowAdmin(!showAdmin)} className={`app-icon-button ${showAdmin ? 'border-transparent bg-google-blue text-white hover:bg-google-blue hover:text-white' : 'hover:bg-google-blue/10'}`} title={t('adminConsole')}>
                    <Shield className="w-5 h-5" />
                  </button>
                )}
                <div className="hidden max-w-[180px] truncate text-sm text-m3-on-surface-variant md:block">{t('hello')}, {user.displayName || user.email || t('guestName')}</div>
                <button onClick={() => signOut(auth)} className="app-icon-button hover:bg-google-red/10 hover:text-google-red" title={t('logout')}><LogOut className="w-5 h-5" /></button>
                </div>
              </div>
            </nav>

            <main id="main-content" tabIndex={-1} className="app-main">
              <Suspense fallback={<RouteLoadingFallback label={t('loading')} />}>
                {showAdmin && isAdmin ? (
                  <AdminDashboard
                      projects={projects}
                      items={items}
                      rooms={rooms}
                      rouletteParticipants={rouletteParticipants}
                      queueParticipants={queueParticipants}
                      gatherFields={gatherFields}
                      gatherSubmissions={gatherSubmissions}
                      scheduleSubmissions={scheduleSubmissions}
                      bookingSlots={bookingSlots}
                      claimItems={claimItems}
                      onDeleteProject={actions.handleDeleteProject}
                      onClose={() => setShowAdmin(false)}
                      t={t}
                  />
                ) : (
                  <AnimatePresence mode="wait">
                    <Routes location={location} key={location.pathname}>
                        <Route
                          path="/"
                          element={
                            <PageTransition>
                              <Dashboard
                                projects={projects}
                                pinnedProjectIds={pinnedProjectIds}
                                recentProjectIds={recentProjectIds}
                                onToggleProjectPin={actions.handleToggleProjectPin}
                                onRecordProjectOpen={actions.handleRecordProjectOpen}
                                onCreateProject={(title, type, creatorName, password) => handleCreateProject(title, type, creatorName, password, showToast)}
                                defaultName={user.displayName || ''}
                                t={t}
                              />
                            </PageTransition>
                          }
                        />
                        <Route path="/collect/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} projectActivities={projectActivities} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/connect/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} projectActivities={projectActivities} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/select/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} projectActivities={projectActivities} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/games/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} projectActivities={projectActivities} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/projects/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} projectActivities={projectActivities} actions={actions} t={t} /></PageTransition>} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                  </AnimatePresence>
                )}
              </Suspense>
            </main>
          </div>
        );
        }}
      </UIProvider>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
