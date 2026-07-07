import React, { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged, signOut, auth } from './lib/localAuth';
import { checkApiHealth } from './lib/apiClient';
import { getBrowserStorageItem, setBrowserStorageItem } from './lib/browserStorage.js';
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
  createBookingSlotData,
  createBookingWaitlistPatch,
  createGatherFieldData,
  createGatherSubmissionData,
  createProjectCascadeDeleteOperations,
  createProjectBriefPatch,
  createProjectCreateData,
  createProjectDuplicateChildOperations,
  createProjectDuplicateData,
  createProjectTemplateSeedData,
  commitProjectCreateWithRollback,
  commitProjectDuplicateWithRollback,
  createQueueJoinData,
  createQueueResultData,
  createRouletteJoinData,
  createRouletteResultData,
  createScheduleConfigData,
  createScheduleSubmissionWrite,
  createTeamJoinMember,
  createTeamMemberRemovalData,
  createVoteToggleOperations,
  createClaimToggleData,
  createProjectStatusPatch,
  normalizeClaimCapacityInput,
  normalizeProjectChildText,
  normalizeRouletteConfigInput,
  normalizeTeamRoomCapacityInput,
  PROJECT_CASCADE_COLLECTIONS,
} from './lib/projectDomain';
import {
  createClearReadNotificationOperations,
  createMarkFriendChatNotificationsReadOperations,
  createMarkNotificationReadOperation,
  createMarkNotificationsReadOperations,
} from './lib/notificationDomain';
import { TRANSLATIONS } from './constants/translations';
import { LogOut, Shield, Bell, Users, X, RotateCcw } from './components/Icons';
import AtmostfairLogo from './components/Logo';
import { UIProvider } from './components/UIComponents';
import AnnouncementSystem from './components/AnnouncementSystem';
import FriendSystem from './components/FriendSystem';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

const LOCKED_PROJECT_STATUSES = new Set(['stopped', 'finished']);
const normalizeAppLanguage = (value) => (value === 'en' || value === 'zh' ? value : 'zh');

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
  const [lang, setLang] = useState(() => normalizeAppLanguage(getBrowserStorageItem('app_lang', 'zh')));
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
    setBrowserStorageItem('app_lang', newLang);
  };

  // ADMIN CONFIGURATION
  const ADMIN_EMAILS = ['quaternijkon@mail.ustc.edu.cn'];
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isSigningOutRef = useRef(false);
  const [serviceHealthError, setServiceHealthError] = useState(false);
  const [serviceHealthReloadKey, setServiceHealthReloadKey] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdmin = user && (ADMIN_EMAILS.includes(user.email) || ADMIN_EMAILS.length === 0);

  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState(false);
  const [projectsReloadKey, setProjectsReloadKey] = useState(0);
  const [userProfile, setUserProfile] = useState(null);
  const [userProfileLoadError, setUserProfileLoadError] = useState(false);
  const [userProfileReloadKey, setUserProfileReloadKey] = useState(0);
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rouletteParticipants, setRouletteParticipants] = useState([]);
  const [queueParticipants, setQueueParticipants] = useState([]);
  const [gatherFields, setGatherFields] = useState([]);
  const [gatherSubmissions, setGatherSubmissions] = useState([]);
  const [scheduleSubmissions, setScheduleSubmissions] = useState([]);
  const [bookingSlots, setBookingSlots] = useState([]);
  const [claimItems, setClaimItems] = useState([]);
  const [gameRooms, setGameRooms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoadError, setNotificationsLoadError] = useState(false);
  const [notificationsReloadKey, setNotificationsReloadKey] = useState(0);
  const [projectActivities, setProjectActivities] = useState([]);
  const [projectActivitiesLoadError, setProjectActivitiesLoadError] = useState(false);
  const [projectActivitiesReloadKey, setProjectActivitiesReloadKey] = useState(0);
  const [workspaceDataLoadErrors, setWorkspaceDataLoadErrors] = useState({});
  const [workspaceDataReloadKey, setWorkspaceDataReloadKey] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingNotificationActionKeys, setPendingNotificationActionKeys] = useState([]);
  const pendingNotificationActionKeysRef = useRef(new Set());
  const isMarkingAllNotificationsRead = pendingNotificationActionKeys.includes('mark-all-read');
  const isClearingReadNotifications = pendingNotificationActionKeys.includes('clear-read');

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

  const handleSignOut = async () => {
    if (isSigningOutRef.current) return;

    isSigningOutRef.current = true;
    setIsSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      isSigningOutRef.current = false;
      setIsSigningOut(false);
    }
  };

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        await checkApiHealth();
        if (isActive) setServiceHealthError(false);
      } catch (error) {
        if (isActive) setServiceHealthError(true);
        console.error('Error checking service health:', error);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [serviceHealthReloadKey]);

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
      setProjectsLoadError(false);
      setUserProfileLoadError(false);
      setNotificationsLoadError(false);
      setProjectActivitiesLoadError(false);
      setWorkspaceDataLoadErrors({});
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
    const subscribeWorkspaceCollection = (collectionName, setCollectionData) => onSnapshot(collection(db, collectionName), (s) => {
      setWorkspaceDataLoadErrors((current) => ({ ...current, [collectionName]: false }));
      setCollectionData(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error(`Error loading workspace data ${collectionName}:`, error);
      setWorkspaceDataLoadErrors((current) => ({ ...current, [collectionName]: true }));
    });

    const unsubUserProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setUserProfileLoadError(false);
      setUserProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, (error) => {
      console.error("Error loading user profile:", error);
      setUserProfileLoadError(true);
    });
    const unsubProjects = onSnapshot(collection(db, 'projects'), (s) => {
      setProjectsLoadError(false);
      setProjects(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)));
      setProjectsLoaded(true);
    }, (error) => {
      console.error("Error loading projects:", error);
      setProjectsLoadError(true);
      setProjectsLoaded(true);
    });
    const unsubItems = subscribeWorkspaceCollection('voting_items', setItems);
    const unsubRooms = subscribeWorkspaceCollection('rooms', setRooms);
    const unsubRoulette = subscribeWorkspaceCollection('roulette_participants', setRouletteParticipants);
    const unsubQueue = subscribeWorkspaceCollection('queue_participants', setQueueParticipants);
    const unsubGatherFields = subscribeWorkspaceCollection('gather_fields', setGatherFields);
    const unsubGatherSubmissions = subscribeWorkspaceCollection('gather_submissions', setGatherSubmissions);
    const unsubScheduleSubmissions = subscribeWorkspaceCollection('schedule_submissions', setScheduleSubmissions);
    const unsubBookingSlots = subscribeWorkspaceCollection('booking_slots', setBookingSlots);
    const unsubClaimItems = subscribeWorkspaceCollection('claim_items', setClaimItems);
    const unsubGameRooms = subscribeWorkspaceCollection('game_rooms', setGameRooms);
    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (s) => {
      setNotificationsLoadError(false);
      setNotifications(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.recipientId === user.uid).sort((a,b)=>b.createdAt-a.createdAt));
    }, (error) => {
      console.error("Error loading notifications:", error);
      setNotificationsLoadError(true);
    });
    const unsubProjectActivities = onSnapshot(collection(db, 'project_activities'), (s) => {
      setProjectActivitiesLoadError(false);
      setProjectActivities(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)));
    }, (error) => {
      console.error("Error loading project activities:", error);
      setProjectActivitiesLoadError(true);
    });
    return () => { unsubUserProfile(); unsubProjects(); unsubItems(); unsubRooms(); unsubRoulette(); unsubQueue(); unsubGatherFields(); unsubGatherSubmissions(); unsubScheduleSubmissions(); unsubBookingSlots(); unsubClaimItems(); unsubGameRooms(); unsubNotifications(); unsubProjectActivities(); };
  }, [notificationsReloadKey, projectActivitiesReloadKey, projectsReloadKey, userProfileReloadKey, workspaceDataReloadKey, user]);

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
  const createActions = (showToast) => {
    const runNotificationAction = async (actionKey, actionLabel, action) => {
      if (pendingNotificationActionKeysRef.current.has(actionKey)) return;

      pendingNotificationActionKeysRef.current.add(actionKey);
      setPendingNotificationActionKeys([...pendingNotificationActionKeysRef.current]);
      try {
        await action();
      } catch (error) {
        showToast(t('errorWithMessage', { title: actionLabel, message: error?.message || t('failed') }), 'error');
      } finally {
        pendingNotificationActionKeysRef.current.delete(actionKey);
        setPendingNotificationActionKeys([...pendingNotificationActionKeysRef.current]);
      }
    };

    return ({
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
         await addDoc(collection(db, 'rooms'), { name: cleanName, projectId, ownerId: user.uid, maxMembers: normalizeTeamRoomCapacityInput(maxMembers), members: [{ uid: user.uid, name: creatorName || currentUserName(), joinedAt: nowMs() }], createdAt: nowMs() });
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
        if (!user) return;
        const room = rooms.find((entry) => entry.id === roomId);
        if (!room || !requireProjectWritable(room.projectId, showToast)) return;
        const project = projects.find((entry) => entry.id === room.projectId);
        const canManageRoom = isAdmin || project?.creatorId === user.uid || room.ownerId === user.uid;
        const memberRemoval = createTeamMemberRemovalData(room, user, memberObject, canManageRoom);
        if (!memberRemoval) return;
        await updateDoc(doc(db, 'rooms', roomId), { members: arrayRemove(memberRemoval) });
        void recordProjectActivity({ projectId: room.projectId, type: PROJECT_ACTIVITY_TYPES.teamMemberRemoved, subject: memberRemoval?.name || room.name });
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
         await updateDoc(doc(db, 'projects', projectId), { rouletteConfig: normalizeRouletteConfigInput(config) });
      },
      handleSaveRouletteResult: async (projectId, config) => {
         if (!user || !requireProjectWritable(projectId, showToast)) return;
         const parts = rouletteParticipants.filter(p => p.projectId === projectId);
         const rouletteResult = createRouletteResultData(parts, normalizeRouletteConfigInput(config), nowMs());
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
         const project = projects.find((entry) => entry.id === projectId);
         const slotData = createBookingSlotData(projectId, start, end, label, nowMs(), project?.bookingConfig);
         if (!slotData) return;
         if (!requireProjectWritable(projectId, showToast)) return;
         // Create a slot doc. If already exists (somehow), ignore or valid. Ideally use unique combination as ID or random.
         // Let's use random ID for slots to allow multiple same-time slots if needed (abstractions).
         await addDoc(collection(db, 'booking_slots'), slotData);
         void recordProjectActivity({ projectId, type: PROJECT_ACTIVITY_TYPES.bookingSlotCreated, subject: slotData.label });
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
        await runNotificationAction(`read:${nId}`, t('notifications'), async () => {
          const operation = createMarkNotificationReadOperation(notifications, nId);
          if (!operation) return;
          await updateDoc(doc(db, operation.collection, operation.id), operation.data);
        });
      },
      handleReadFriendChatNotifications: async (chatId) => {
        if (!chatId) return;
        await runNotificationAction(`friend-chat:${chatId}`, t('notifications'), async () => {
          const operations = createMarkFriendChatNotificationsReadOperations(notifications, chatId);
          if (operations.length === 0) return;
          const batch = writeBatch(db);
          operations.forEach((operation) => {
            batch.update(doc(db, operation.collection, operation.id), operation.data);
          });
          await batch.commit();
        });
      },
      handleMarkAllNotificationsRead: async () => {
        await runNotificationAction('mark-all-read', t('markAllRead'), async () => {
          const operations = createMarkNotificationsReadOperations(notifications);
          if (operations.length === 0) return;
          const batch = writeBatch(db);
          operations.forEach((operation) => {
            batch.update(doc(db, operation.collection, operation.id), operation.data);
          });
          await batch.commit();
        });
      },
      handleClearReadNotifications: async () => {
        await runNotificationAction('clear-read', t('clearRead'), async () => {
          const operations = createClearReadNotificationOperations(notifications);
          if (operations.length === 0) return;
          const batch = writeBatch(db);
          operations.forEach((operation) => {
            batch.delete(doc(db, operation.collection, operation.id));
          });
          await batch.commit();
        });
      },
      handleCreateClaimItem: async (projectId, title, maxClaims) => {
         const cleanTitle = normalizeProjectChildText(title);
         if (!user || !cleanTitle || !requireProjectWritable(projectId, showToast)) return;
         await addDoc(collection(db, 'claim_items'), { projectId, title: cleanTitle, maxClaims: normalizeClaimCapacityInput(maxClaims), claimants: [], creatorId: user.uid, creatorName: currentUserName(), createdAt: nowMs() });
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
        if (userProfileLoadError) return;
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
        if (!user || !cleanProjectId) return;
        if (userProfileLoadError) return;
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
  };

  const retryProjectActivities = () => {
    setProjectActivitiesReloadKey((current) => current + 1);
  };

  const retryWorkspaceData = () => {
    setWorkspaceDataReloadKey((current) => current + 1);
  };

  const retryServiceHealth = () => {
    setServiceHealthReloadKey((current) => current + 1);
  };

  const handleCreateProject = async (title, type, creatorName, password, showToast, templateId = null) => {
    const createdAt = nowMs();
    let projectData = createProjectCreateData(title, type, user, creatorName, password, createdAt);
    if (!projectData) {
      showToast(t('createProjectFailed'), 'error');
      return { ok: false };
    }
    const templateSeed = createProjectTemplateSeedData(templateId, type, '', user, creatorName, createdAt, t);
    projectData = { ...projectData, ...templateSeed.projectPatch };
    try {
      const projectRef = await commitProjectCreateWithRollback({
        db,
        collection,
        addDoc,
        deleteDoc,
        projectData,
        createChildOperations: (projectRef) => createProjectTemplateSeedData(
          templateId,
          type,
          projectRef.id,
          user,
          creatorName,
          createdAt,
          t,
        ).childOperations,
      });
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
            <Login
              lang={lang}
              setLang={setLang}
              t={t}
              isServiceUnavailable={serviceHealthError}
              onRetryServiceHealth={retryServiceHealth}
              onServiceHealthFailure={() => setServiceHealthError(true)}
            />
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
                  {showFriends && <FriendSystem user={user} onClose={() => setShowFriends(false)} t={t} onReadFriendChatNotifications={actions.handleReadFriendChatNotifications} />}
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
                                       disabled={notificationsLoadError || !notifications.some(n => !n.read) || isMarkingAllNotificationsRead}
                                       aria-busy={isMarkingAllNotificationsRead}
                                       className="rounded-full border border-m3-outline-variant/60 px-2 py-1.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:border-google-blue/40 hover:bg-google-blue/5 hover:text-google-blue disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-m3-outline-variant/60 disabled:hover:bg-transparent disabled:hover:text-m3-on-surface-variant"
                                     >
                                       {isMarkingAllNotificationsRead ? t('processing') : t('markAllRead')}
                                     </button>
                                     <button
                                       type="button"
                                       onClick={actions.handleClearReadNotifications}
                                       disabled={notificationsLoadError || !notifications.some(n => n.read) || isClearingReadNotifications}
                                       aria-busy={isClearingReadNotifications}
                                       className="rounded-full border border-m3-outline-variant/60 px-2 py-1.5 text-xs font-medium text-m3-on-surface-variant transition-colors hover:border-google-blue/40 hover:bg-google-blue/5 hover:text-google-blue disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-m3-outline-variant/60 disabled:hover:bg-transparent disabled:hover:text-m3-on-surface-variant"
                                     >
                                       {isClearingReadNotifications ? t('processing') : t('clearRead')}
                                     </button>
                                 </div>
                             </div>
                             <div className="max-h-64 overflow-y-auto">
                                 {notificationsLoadError ? (
                                     <div role="alert" className="flex min-h-32 flex-col items-center justify-center gap-3 p-4 text-center text-xs text-m3-on-surface-variant">
                                         <p>{t('notificationsLoadFailed')}</p>
                                         <button
                                           type="button"
                                           onClick={() => setNotificationsReloadKey((current) => current + 1)}
                                           className="app-button-quiet text-google-blue"
                                         >
                                           <RotateCcw className="h-4 w-4" />
                                           {t('chatRetry')}
                                         </button>
                                     </div>
                                 ) : notifications.length === 0 ? (
                                     <div className="p-4 text-center text-xs text-m3-on-surface-variant">{t('noNotifications')}</div>
                                 ) : (
                                     notifications.map(n => {
                                         const isNotificationReadPending = pendingNotificationActionKeys.includes(`read:${n.id}`);
                                         return (
                                             <button
                                               key={n.id}
                                               onClick={() => actions.handleReadNotification(n.id)}
                                               disabled={isNotificationReadPending}
                                               aria-busy={isNotificationReadPending}
                                               className={`w-full border-b border-m3-outline-variant/20 p-3 text-left transition-colors hover:bg-google-blue/5 disabled:cursor-not-allowed ${n.read ? 'opacity-65' : 'bg-google-blue/5'}`}
                                             >
                                                 <div className="text-sm font-medium mb-1">{n.title}</div>
                                                 <div className="text-xs text-m3-on-surface-variant">{n.message}</div>
                                                 <div className="text-[10px] text-m3-on-surface-variant/60 mt-1 text-right">{formatDate(n.createdAt, t)}</div>
                                             </button>
                                         );
                                     })
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
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  aria-busy={isSigningOut}
                  className="app-icon-button hover:bg-google-red/10 hover:text-google-red"
                  title={isSigningOut ? t('processing') : t('logout')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
                </div>
              </div>
            </nav>

            {serviceHealthError && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4">
                <div role="alert" className="app-card-quiet flex flex-col gap-3 px-4 py-3 text-sm text-m3-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                  <p>{t('serviceHealthUnavailable')}</p>
                  <button
                    type="button"
                    onClick={retryServiceHealth}
                    className="app-button-quiet self-start text-google-blue sm:self-auto"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('chatRetry')}
                  </button>
                </div>
              </div>
            )}

            {userProfileLoadError && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4">
                <div role="alert" className="app-card-quiet flex flex-col gap-3 px-4 py-3 text-sm text-m3-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                  <p>{t('userProfileLoadFailed')}</p>
                  <button
                    type="button"
                    onClick={() => setUserProfileReloadKey((current) => current + 1)}
                    className="app-button-quiet self-start text-google-blue sm:self-auto"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('chatRetry')}
                  </button>
                </div>
              </div>
            )}

            <main id="main-content" tabIndex={-1} className="app-main">
              <Suspense fallback={<RouteLoadingFallback label={t('loading')} />}>
                {projectsLoadError ? (
                  <div className="flex min-h-[360px] w-full items-center justify-center px-4">
                    <div role="alert" className="app-card flex max-w-md flex-col items-center gap-4 px-6 py-8 text-center">
                      <p className="text-sm font-medium text-m3-on-surface-variant">{t('projectsLoadFailed')}</p>
                      <button
                        type="button"
                        onClick={() => setProjectsReloadKey((current) => current + 1)}
                        className="app-button-quiet text-google-blue"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t('chatRetry')}
                      </button>
                    </div>
                  </div>
                ) : showAdmin && isAdmin ? (
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
                                isUserProfileAvailable={!userProfileLoadError}
                                onToggleProjectPin={actions.handleToggleProjectPin}
                                onRecordProjectOpen={actions.handleRecordProjectOpen}
                                onCreateProject={(title, type, creatorName, password, templateId) => handleCreateProject(title, type, creatorName, password, showToast, templateId)}
                                defaultName={user.displayName || ''}
                                t={t}
                              />
                            </PageTransition>
                          }
                        />
                        <Route path="/collect/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} gameRooms={gameRooms} projectActivities={projectActivities} projectActivitiesLoadError={projectActivitiesLoadError} onRetryProjectActivities={retryProjectActivities} workspaceDataLoadErrors={workspaceDataLoadErrors} onRetryWorkspaceData={retryWorkspaceData} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/connect/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} gameRooms={gameRooms} projectActivities={projectActivities} projectActivitiesLoadError={projectActivitiesLoadError} onRetryProjectActivities={retryProjectActivities} workspaceDataLoadErrors={workspaceDataLoadErrors} onRetryWorkspaceData={retryWorkspaceData} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/select/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} gameRooms={gameRooms} projectActivities={projectActivities} projectActivitiesLoadError={projectActivitiesLoadError} onRetryProjectActivities={retryProjectActivities} workspaceDataLoadErrors={workspaceDataLoadErrors} onRetryWorkspaceData={retryWorkspaceData} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/games/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} gameRooms={gameRooms} projectActivities={projectActivities} projectActivitiesLoadError={projectActivitiesLoadError} onRetryProjectActivities={retryProjectActivities} workspaceDataLoadErrors={workspaceDataLoadErrors} onRetryWorkspaceData={retryWorkspaceData} actions={actions} t={t} /></PageTransition>} />
                        <Route path="/projects/:id" element={<PageTransition><ProjectDetail projects={projects} projectsLoaded={projectsLoaded} user={user} isAdmin={isAdmin} items={items} rooms={rooms} rouletteData={rouletteParticipants} queueData={queueParticipants} gatherFields={gatherFields} gatherSubmissions={gatherSubmissions} scheduleSubmissions={scheduleSubmissions} bookingSlots={bookingSlots} claimItems={claimItems} gameRooms={gameRooms} projectActivities={projectActivities} projectActivitiesLoadError={projectActivitiesLoadError} onRetryProjectActivities={retryProjectActivities} workspaceDataLoadErrors={workspaceDataLoadErrors} onRetryWorkspaceData={retryWorkspaceData} actions={actions} t={t} /></PageTransition>} />
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
