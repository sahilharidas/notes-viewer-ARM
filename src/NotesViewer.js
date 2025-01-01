import React, { useReducer, useEffect, useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Award, Zap, User, Brain } from 'lucide-react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from './contexts/AuthContext';
import { db } from './config/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, AlertDescription } from './components/ui/Alert'
import ProfilePicture from './components/ui/ProfilePicture';
import XPStatsHeader from './components/ui/XPStatsHeader';
import DeveloperTools from './components/DeveloperTools';

// Constants for XP System
const MIN_TIME_BETWEEN_REVIEWS = 3000;
const MAX_REVIEWS_PER_HOUR = 100;
const MAX_XP_PER_DAY = 1000;
const REVIEW_COOLDOWN = 12 * 60 * 60 * 1000;

// Initial state
const initialState = {
    chapters: [],
    currentChapter: 0,
    currentCard: 0,
    streak: 0,
    lastStudyDate: null,
    xp: 0,
    isDrawerOpen: false,
    loading: true,
    error: null,
    cardsStudiedToday: 0,
    showCongrats: false,
    dailyGoal: 15,
    cardProgress: {}, // New tracking object
    dueCardsStreak: 0,
    lastDueCardsCompletion: null,
    reviewHistory: {
        lastReviewTime: null,
        dailyReviews: new Map(),
        hourlyReviews: new Map(),
        dailyXP: new Map(),
        cardReviewTimes: new Map(),
    },
    errorMessage: null,
    xpStats: {
        dailyXP: 0,
        remainingXP: MAX_XP_PER_DAY,
        hourlyReviews: 0,
    }
};

// These need to be added near the top with other helper functions
const defaultCardProgress = {
    level: 0,
    lastReviewDate: null,
    nextReviewDate: null,
    totalReviews: 0,
    correctReviews: 0,
    difficulty: 1.0,
    consecutiveCorrect: 0,
};

function calculateNextReview(level, difficulty) {
    const now = new Date();
    const baseIntervals = {
        0: 1,    // 1 day
        1: 3,    // 3 days
        2: 7,    // 1 week
        3: 14,   // 2 weeks
        4: 30,   // 1 month
        5: 90,   // 3 months
    };

    const interval = baseIntervals[level] || 90;
    const adjustedInterval = interval * difficulty;
    return new Date(now.getTime() + adjustedInterval * 24 * 60 * 60 * 1000);
}

function calculateXP(cardProgress, isDueCard) {
    const { lastReviewDate, level, difficulty, consecutiveCorrect } = cardProgress;

    const daysSinceReview = lastReviewDate
        ? (new Date() - new Date(lastReviewDate)) / (24 * 60 * 60 * 1000)
        : Infinity;

    const timeBonus = daysSinceReview >= 0.9 && daysSinceReview <= 1.1 ? 1.5 : 1;
    const baseXP = 10 + (level * 5);
    const streakBonus = consecutiveCorrect > 0 ? Math.min(1.5, 1 + (consecutiveCorrect * 0.1)) : 1;
    const difficultyBonus = Math.max(1, difficulty);
    const dueBonus = isDueCard ? 1.25 : 1;

    return Math.round(baseXP * timeBonus * streakBonus * difficultyBonus * dueBonus);
}

function adjustDifficulty(cardProgress, wasCorrect) {
    const { difficulty, consecutiveCorrect } = cardProgress;

    if (wasCorrect) {
        const newConsecutive = consecutiveCorrect + 1;
        const difficultyIncrease = 0.1 * (newConsecutive > 3 ? 1.5 : 1);
        return {
            difficulty: Math.min(2.0, difficulty + difficultyIncrease),
            consecutiveCorrect: newConsecutive,
        };
    } else {
        return {
            difficulty: Math.max(0.5, difficulty * 0.75),
            consecutiveCorrect: 0,
        };
    }
}

function getDueCards(cardProgress) {
    const now = new Date();
    return Object.entries(cardProgress)
        .filter(([cardId, progress]) => {
            if (!progress.nextReviewDate) return true;
            return new Date(progress.nextReviewDate) <= now;
        })
        .map(([cardId]) => cardId);
}

// Helper functions for XP calculation
function getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
}

function getHourKey(date = new Date()) {
    return Math.floor(date.getTime() / (60 * 60 * 1000));
}

function isCardInCooldown(cardId, reviewHistory) {
    const lastReviewTime = reviewHistory.cardReviewTimes.get(cardId);
    if (!lastReviewTime) return false;

    const now = new Date();
    const lastReview = new Date(lastReviewTime);
    const timeSinceLastReview = now - lastReview;

    return timeSinceLastReview < REVIEW_COOLDOWN;
}

// Add this component definition before the main LearningViewer component
function ReviewButton({ onClick, disabled, xpGain, lastReviewTime }) {
    const cooldownTimeLeft = disabled && lastReviewTime ?
        Math.ceil((REVIEW_COOLDOWN - (new Date() - new Date(lastReviewTime))) / (60 * 60 * 1000)) :
        0;

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex-1 ${disabled
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600'
                } text-white font-bold py-3 px-4 rounded-lg shadow transform ${!disabled ? 'hover:scale-105' : ''} transition-all duration-200`}
            title={disabled && cooldownTimeLeft > 0 ? `Available in ${cooldownTimeLeft} hours` : ''}
        >
            <div>Got it!</div>
            <div className="text-xs text-green-100">+{xpGain} XP</div>
        </button>
    );
}

// Reducer function
function learningReducer(state, action) {
    switch (action.type) {
        case 'SET_CHAPTERS':
            return { ...state, chapters: action.payload, loading: false };
        case 'SET_ERROR':
            return { ...state, error: action.payload, loading: false };
        case 'SET_PROGRESS':
            return { ...state, ...action.payload };
        case 'COMPLETE_CARD': {
            const { currentChapter, currentCard, chapters, wasCorrect = true } = action.payload;
            const currentChapterData = chapters[currentChapter];
            const cardId = currentChapterData.cards[currentCard].id;

            // Get current time
            const now = new Date();

            // Check cooldown
            const lastReviewTime = state.reviewHistory.cardReviewTimes.get(cardId);
            if (lastReviewTime) {
                const timeSinceLastReview = now - new Date(lastReviewTime);
                if (timeSinceLastReview < REVIEW_COOLDOWN) {
                    const hoursLeft = Math.ceil((REVIEW_COOLDOWN - timeSinceLastReview) / (60 * 60 * 1000));
                    return {
                        ...state,
                        errorMessage: `This card is in cooldown. Available in ${hoursLeft} hours.`
                    };
                }
            }

            // Check hourly limit
            const hourKey = getHourKey(now);
            const hourlyReviews = state.reviewHistory.hourlyReviews.get(hourKey) || 0;
            if (hourlyReviews >= MAX_REVIEWS_PER_HOUR) {
                return {
                    ...state,
                    errorMessage: 'Hourly review limit reached. Please take a break.'
                };
            }

            // Clear any existing error message
            const newState = {
                ...state,
                errorMessage: null
            };

            // Update card review times
            const newCardReviewTimes = new Map(state.reviewHistory.cardReviewTimes);
            newCardReviewTimes.set(cardId, now.toISOString());

            // Calculate XP and update progress
            const cardProgress = state.cardProgress[cardId] || { ...defaultCardProgress };
            const isDueCard = getDueCards(state.cardProgress).includes(cardId);
            const xpGain = calculateXP(cardProgress, isDueCard);

            // Update the rest of the state (similar to your existing logic)
            return {
                ...newState,
                currentCard: currentCard + 1 >= currentChapterData.cards.length ? 0 : currentCard + 1,
                currentChapter: currentCard + 1 >= currentChapterData.cards.length ?
                    (currentChapter + 1 >= chapters.length ? currentChapter : currentChapter + 1) :
                    currentChapter,
                cardProgress: {
                    ...state.cardProgress,
                    [cardId]: {
                        ...cardProgress,
                        level: wasCorrect ? Math.min(5, cardProgress.level + 1) : Math.max(0, cardProgress.level - 1),
                        lastReviewDate: now.toISOString(),
                        nextReviewDate: calculateNextReview(
                            wasCorrect ? Math.min(5, cardProgress.level + 1) : Math.max(0, cardProgress.level - 1),
                            cardProgress.difficulty
                        ).toISOString(),
                        totalReviews: cardProgress.totalReviews + 1,
                        correctReviews: cardProgress.correctReviews + (wasCorrect ? 1 : 0),
                    }
                },
                reviewHistory: {
                    ...state.reviewHistory,
                    cardReviewTimes: newCardReviewTimes,
                    lastReviewTime: now.toISOString(),
                },
                xp: state.xp + xpGain,
                cardsStudiedToday: state.cardsStudiedToday + 1
            };
        }

        case 'MARK_FORGOTTEN': {
            const { cardId } = action.payload;
            const cardProgress = state.cardProgress[cardId];

            if (!cardProgress) return state;

            return {
                ...state,
                cardProgress: {
                    ...state.cardProgress,
                    [cardId]: {
                        ...defaultCardProgress,
                        totalReviews: cardProgress.totalReviews + 1,
                        correctReviews: cardProgress.correctReviews,
                    },
                },
            };
        }
        case 'CLEAR_ERROR': {
            return {
                ...state,
                errorMessage: null
            };
        }
        case 'TOGGLE_DRAWER':
            return { ...state, isDrawerOpen: !state.isDrawerOpen };
        case 'SET_CONGRATS':
            return { ...state, showCongrats: action.payload };
        case 'NAVIGATE_PREV': {
            if (state.currentCard > 0) {
                return {
                    ...state,
                    currentCard: state.currentCard - 1
                };
            }
            return state;
        }

        case 'NAVIGATE_NEXT': {
            const currentChapterData = state.chapters[state.currentChapter];
            if (state.currentCard < currentChapterData.cards.length - 1) {
                return {
                    ...state,
                    currentCard: state.currentCard + 1
                };
            }
            return state;
        }
        default:
            return state;
    }
}

// Custom hook for keyboard navigation
function useKeyboardNavigation(dispatch, currentCard, totalCards, state) {
    useEffect(() => {
        function handleKeyPress(e) {
            if (e.key === 'ArrowRight' && currentCard < totalCards - 1) {
                e.preventDefault();
                dispatch({
                    type: 'COMPLETE_CARD',
                    payload: {
                        currentChapter: state.currentChapter,
                        currentCard: state.currentCard,
                        chapters: state.chapters,
                        wasCorrect: true
                    }
                });
            } else if (e.key === 'ArrowLeft' && currentCard > 0) {
                e.preventDefault();
                dispatch({ type: 'NAVIGATE_PREV' });
            }
        }

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [currentCard, totalCards, dispatch, state]);
}

// Custom hook for offline support
function useOfflineSupport(isOnline) {
    const [pendingUpdates, setPendingUpdates] = useState([]);

    useEffect(() => {
        if (isOnline && pendingUpdates.length > 0) {
            // Process pending updates
            const processPendingUpdates = async () => {
                for (const update of pendingUpdates) {
                    try {
                        await update();
                    } catch (error) {
                        console.error('Failed to process pending update:', error);
                    }
                }
                setPendingUpdates([]);
            };

            processPendingUpdates();
        }
    }, [isOnline, pendingUpdates]);

    return { addPendingUpdate: update => setPendingUpdates(prev => [...prev, update]) };
}

// Add this helper function near the top level of your file
const findCardById = (chapters, targetId) => {
    for (const chapter of chapters) {
        const card = chapter.cards.find(card => card.id === targetId);
        if (card) {
            return {
                ...card,
                chapterTitle: chapter.title
            };
        }
    }
    return null;
};

// Add this navigation helper
const navigateToCard = (cardId, chapters) => {
    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
        const cardIndex = chapters[chapterIndex].cards.findIndex(card => card.id === cardId);
        if (cardIndex !== -1) {
            return {
                type: 'SET_PROGRESS',
                payload: {
                    currentChapter: chapterIndex,
                    currentCard: cardIndex,
                    isDrawerOpen: false
                }
            };
        }
    }
    return null;
};

const LearningViewer = () => {
    const { user, signInWithGoogle, signOut } = useAuth();
    const [state, dispatch] = useReducer(learningReducer, initialState);
    const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

    const currentChapterData = useMemo(() =>
        state.chapters[state.currentChapter] || null,
        [state.chapters, state.currentChapter]
    );

    const currentCardData = useMemo(() =>
        currentChapterData?.cards[state.currentCard] || null,
        [currentChapterData, state.currentCard]
    );

    const progressPercentage = useMemo(() =>
        (state.cardsStudiedToday / state.dailyGoal) * 100,
        [state.cardsStudiedToday, state.dailyGoal]
    );

    const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQFscVOqoOj_c05nM2zfkQU5pFoUpTTfTdmOGtEJ1gPWMPROzHrBKhHBAvzXrG1CEuZdN34uC65-VHz/pub?gid=0&single=true&output=csv';

    // Online status monitoring
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useKeyboardNavigation(
        dispatch,
        state.currentCard,
        currentChapterData?.cards.length || 0,
        state
    );

    const fetchContent = useCallback(async () => {
        try {
            const response = await fetch(SHEETS_URL);
            if (!response.ok) throw new Error('Failed to fetch content');

            const text = await response.text();

            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const chaptersMap = {};
                    results.data.forEach(row => {
                        if (!row.chapterId || !row.content) return;

                        if (!chaptersMap[row.chapterId]) {
                            chaptersMap[row.chapterId] = {
                                id: row.chapterId,
                                title: row.chapterTitle,
                                cards: []
                            };
                        }

                        chaptersMap[row.chapterId].cards.push({
                            id: row.id,
                            content: row.content,
                            type: row.type || 'text',
                            difficulty: row.difficulty || 'medium',
                            xpValue: parseInt(row.xpValue) || 10
                        });
                    });

                    dispatch({ type: 'SET_CHAPTERS', payload: Object.values(chaptersMap) });
                },
                error: (error) => {
                    dispatch({ type: 'SET_ERROR', payload: 'Failed to parse content' });
                }
            });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch content' });
        }
    }, []);

    // Load content and progress
    useEffect(() => {
        fetchContent();
        if (user) {
            loadProgress();
        }
    }, [user, fetchContent]);

    // Update loadProgress function
    const loadProgress = async () => {
        if (!user) return;

        try {
            const progressRef = doc(db, 'progress', user.uid);
            const progressDoc = await getDoc(progressRef);

            if (progressDoc.exists()) {
                const data = progressDoc.data();

                // Convert the review history object back to Maps
                const reviewHistory = {
                    lastReviewTime: data.reviewHistory?.lastReviewTime || null,
                    dailyReviews: new Map(Object.entries(data.reviewHistory?.dailyReviews || {})),
                    hourlyReviews: new Map(Object.entries(data.reviewHistory?.hourlyReviews || {})),
                    dailyXP: new Map(Object.entries(data.reviewHistory?.dailyXP || {})),
                    cardReviewTimes: new Map(
                        // Ensure we're converting the timestamps correctly
                        Object.entries(data.reviewHistory?.cardReviewTimes || {}).map(([cardId, timestamp]) => [
                            cardId,
                            typeof timestamp === 'string' ? timestamp : timestamp.toDate().toISOString()
                        ])
                    ),
                };

                const dateKey = getDateKey();
                const hourKey = getHourKey();

                dispatch({
                    type: 'SET_PROGRESS',
                    payload: {
                        streak: data.streak || 0,
                        xp: data.xp || 0,
                        lastStudyDate: data.lastStudyDate,
                        cardsStudiedToday: data.cardsStudiedToday || 0,
                        currentChapter: data.currentChapter || 0,
                        currentCard: data.currentCard || 0,
                        cardProgress: data.cardProgress || {},
                        reviewHistory,
                        xpStats: {
                            dailyXP: reviewHistory.dailyXP.get(dateKey) || 0,
                            remainingXP: Math.max(0, MAX_XP_PER_DAY - (reviewHistory.dailyXP.get(dateKey) || 0)),
                            hourlyReviews: reviewHistory.hourlyReviews.get(hourKey) || 0,
                        },
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load progress:', error);
        }
    };

    const saveProgress = async () => {
        if (!user) return;

        try {
            const progressRef = doc(db, 'progress', user.uid);
            await setDoc(progressRef, {
                userId: user.uid,
                streak: state.streak,
                xp: state.xp,
                cardProgress: state.cardProgress,
                reviewHistory: {
                    lastReviewTime: state.reviewHistory.lastReviewTime,
                    dailyReviews: Object.fromEntries(state.reviewHistory.dailyReviews),
                    hourlyReviews: Object.fromEntries(state.reviewHistory.hourlyReviews),
                    dailyXP: Object.fromEntries(state.reviewHistory.dailyXP),
                    cardReviewTimes: Object.fromEntries(state.reviewHistory.cardReviewTimes),
                },
                dueCardsStreak: state.dueCardsStreak,
                lastDueCardsCompletion: state.lastDueCardsCompletion,
                lastStudyDate: new Date().toISOString(),
                cardsStudiedToday: state.cardsStudiedToday,
                currentChapter: state.currentChapter,
                currentCard: state.currentCard,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    };

    const resetProgress = async () => {
        if (!user) return;

        try {
            const progressRef = doc(db, 'progress', user.uid);
            await setDoc(progressRef, {
                userId: user.uid,
                streak: 0,
                xp: 0,
                cardProgress: {},
                dueCardsStreak: 0,
                lastDueCardsCompletion: null,
                lastStudyDate: null,
                cardsStudiedToday: 0,
                currentChapter: 0,
                currentCard: 0,
                updatedAt: serverTimestamp()
            }, { merge: false }); // Use merge: false to completely overwrite the document

            // Reset local state
            dispatch({
                type: 'SET_PROGRESS',
                payload: {
                    streak: 0,
                    xp: 0,
                    cardProgress: {},
                    dueCardsStreak: 0,
                    lastDueCardsCompletion: null,
                    lastStudyDate: null,
                    cardsStudiedToday: 0,
                    currentChapter: 0,
                    currentCard: 0
                }
            });

        } catch (error) {
            console.error('Failed to reset progress:', error);
        }
    };

    const completeCard = useCallback(async (wasCorrect = true) => {
        const cardId = currentCardData.id;

        // Check if this specific card is in cooldown
        if (isCardInCooldown(cardId, state.reviewHistory)) {
            // Add a visual feedback that the card is in cooldown
            console.log('Card is in cooldown');
            return;
        }

        // Check other rate limiting conditions
        const now = new Date();
        const hourKey = getHourKey(now);
        const dateKey = getDateKey(now);

        // Check hourly limit
        const hourlyReviews = state.reviewHistory.hourlyReviews.get(hourKey) || 0;
        if (hourlyReviews >= MAX_REVIEWS_PER_HOUR) {
            console.log('Hourly review limit reached');
            return;
        }

        // Check time between reviews
        if (state.reviewHistory.lastReviewTime) {
            const timeSinceLastReview = now - new Date(state.reviewHistory.lastReviewTime);
            if (timeSinceLastReview < MIN_TIME_BETWEEN_REVIEWS) {
                console.log('Please wait between reviews');
                return;
            }
        }

        // Create a new action
        const action = {
            type: 'COMPLETE_CARD',
            payload: {
                currentChapter: state.currentChapter,
                currentCard: state.currentCard,
                chapters: state.chapters,
                wasCorrect
            }
        };

        // Dispatch the action first
        dispatch(action);

        // After state is updated, handle streak and daily goals
        const today = new Date().toDateString();
        const lastDate = state.lastStudyDate ? new Date(state.lastStudyDate).toDateString() : null;

        let newStreak = state.streak;
        let newCardsStudiedToday = state.cardsStudiedToday + 1;

        if (today !== lastDate) {
            newCardsStudiedToday = 1;
            if (lastDate === new Date(Date.now() - 86400000).toDateString()) {
                newStreak = state.streak + 1;
                if (newStreak % 5 === 0) {
                    dispatch({ type: 'SET_CONGRATS', payload: true });
                }
            } else {
                newStreak = 1;
            }
        } else if (newCardsStudiedToday === state.dailyGoal) {
            dispatch({ type: 'SET_CONGRATS', payload: true });
        }

        // Save progress only if we haven't returned early due to cooldown or rate limiting
        await saveProgress();
    }, [state, dispatch, saveProgress, currentCardData]);

    if (!user) {
        return (
            <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                <div className="bg-white p-8 rounded-lg shadow-xl text-center">
                    <h2 className="text-2xl font-bold mb-4">Welcome to Learning Viewer</h2>
                    <p className="text-gray-600 mb-6">Please sign in to continue</p>
                    <button
                        onClick={signInWithGoogle}
                        className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                    >
                        Sign in with Google
                    </button>
                </div>
            </div>
        );
    }

    if (state.loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                <div className="text-2xl text-white animate-pulse">Loading your learning journey...</div>
            </div>
        );
    }

    if (!currentChapterData || !currentCardData) {
        return (
            <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                <div className="text-2xl text-white">No content available</div>
            </div>
        );
    }

    if (state.error) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gradient-to-r from-indigo-500 to-purple-600">
            {/* Header with user profile and stats */}
            <div className="sticky top-0 bg-white bg-opacity-95 shadow-lg">
                <div className="flex items-center justify-between p-4">
                    {/* Left side - User Profile */}
                    <div className="flex items-center">
                        <button
                            onClick={() => dispatch({ type: 'TOGGLE_DRAWER' })}
                            className="p-2 hover:bg-gray-100 rounded-full mr-2"
                        >
                            <Menu size={24} />
                        </button>
                        <ProfilePicture
                            src={user.photoURL}
                            alt={user.displayName}
                            className="w-8 h-8 rounded-full mr-2"
                        />
                        <span className="font-medium">{user.displayName}</span>
                    </div>

                    {/* Center - XP Stats */}
                    <XPStatsHeader
                        xp={state.xp}
                        xpStats={state.xpStats}
                        streak={state.streak}
                        dueCardsStreak={state.dueCardsStreak}
                    />

                    {/* Right side - Actions */}
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={resetProgress}
                            className="text-red-600 hover:text-red-800"
                        >
                            Reset Progress
                        </button>
                        <button
                            onClick={signOut}
                            className="text-gray-600 hover:text-gray-800"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>

                {/* Keep existing progress bar */}
                <div className="px-4 pb-2">
                    <div className="relative h-2 bg-gray-200 rounded-full">
                        <div
                            className="absolute h-full bg-green-400 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                        />
                    </div>
                    <div className="text-center text-sm mt-1 text-white">
                        {state.cardsStudiedToday} / {state.dailyGoal} cards today
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-4">
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                        <div className="p-6">
                            <h2 className="text-2xl font-bold mb-4">{currentChapterData.title}</h2>
                            <div className="prose prose-sm">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {currentCardData.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>

                    {/* Card progress display */}
                    {state.cardProgress[currentCardData.id] && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-gray-600">Level</div>
                                    <div className="font-bold">{state.cardProgress[currentCardData.id].level}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-600">Difficulty</div>
                                    <div className="font-bold">
                                        {state.cardProgress[currentCardData.id].difficulty.toFixed(2)}x
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-600">Accuracy</div>
                                    <div className="font-bold">
                                        {((state.cardProgress[currentCardData.id].correctReviews /
                                            state.cardProgress[currentCardData.id].totalReviews) * 100 || 0).toFixed(1)}%
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-600">Reviews</div>
                                    <div className="font-bold">
                                        {state.cardProgress[currentCardData.id].totalReviews}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex space-x-2 mt-4">
                        {/* Calculate potential XP gain */}
                        {(() => {
                            const cardId = currentCardData.id;
                            const cardProgress = state.cardProgress[cardId] || { ...defaultCardProgress };
                            const isDueCard = getDueCards(state.cardProgress).includes(cardId);
                            const potentialXP = calculateXP(cardProgress, isDueCard);
                            const isInCooldown = isCardInCooldown(cardId, state.reviewHistory);
                            const lastReviewTime = state.reviewHistory.cardReviewTimes.get(cardId);

                            return (
                                <>
                                    <ReviewButton
                                        onClick={() => completeCard(true)}
                                        disabled={isInCooldown}
                                        xpGain={potentialXP}
                                        lastReviewTime={lastReviewTime}
                                    />
                                    <button
                                        onClick={() => completeCard(false)}
                                        disabled={isInCooldown}
                                        className={`flex-1 ${isInCooldown
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-yellow-500 hover:bg-yellow-600'
                                            } text-white font-bold py-3 px-4 rounded-lg shadow transform ${!isInCooldown ? 'hover:scale-105' : ''} transition-all duration-200`}
                                        title={isInCooldown && lastReviewTime ? `Available in ${Math.ceil((REVIEW_COOLDOWN - (new Date() - new Date(lastReviewTime))) / (60 * 60 * 1000))} hours` : ''}
                                    >
                                        <div>Needs Review</div>
                                        <div className="text-xs text-yellow-100">
                                            {isDueCard ? "Due for review" : "Mark for review"}
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => dispatch({
                                            type: 'MARK_FORGOTTEN',
                                            payload: { cardId: currentCardData.id }
                                        })}
                                        disabled={isInCooldown}
                                        className={`flex-1 ${isInCooldown
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-red-500 hover:bg-red-600'
                                            } text-white font-bold py-3 px-4 rounded-lg shadow transform ${!isInCooldown ? 'hover:scale-105' : ''} transition-all duration-200`}
                                        title={isInCooldown && lastReviewTime ? `Available in ${Math.ceil((REVIEW_COOLDOWN - (new Date() - new Date(lastReviewTime))) / (60 * 60 * 1000))} hours` : ''}
                                    >
                                        <div>Forgot This</div>
                                        <div className="text-xs text-red-100">Reset progress</div>
                                    </button>
                                </>
                            );
                        })()}</div>
                </div>
            </div>

            {/* Navigation */}
            <div className="sticky bottom-0 bg-white border-t shadow-lg">
                <div className="flex justify-between items-center p-4">
                    <div className="text-sm text-gray-600">
                        Card {state.currentCard + 1} of {currentChapterData.cards.length}
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => dispatch({ type: 'NAVIGATE_PREV' })}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                            disabled={state.currentCard === 0}
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            onClick={() => dispatch({ type: 'NAVIGATE_NEXT' })}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                            disabled={state.currentCard === currentChapterData.cards.length - 1}
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Congratulations modal */}
            {state.showCongrats && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 text-center">
                        <Award className="mx-auto text-yellow-400 mb-4" size={48} />
                        <h2 className="text-2xl font-bold mb-2">
                            {state.streak % 5 === 0 ? `${state.streak} Day Streak!` : 'Daily Goal Reached!'}
                        </h2>
                        <p className="text-gray-600 mb-4">
                            Keep up the great work! 🎉
                        </p>
                        <button
                            onClick={() => dispatch({ type: 'SET_CONGRATS', payload: false })}
                            className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
                        >
                            Continue Learning
                        </button>
                    </div>
                </div>
            )}

            {/* Chapter drawer */}
            {/* Chapter drawer */}
            {state.isDrawerOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-40"
                        onClick={() => dispatch({ type: 'TOGGLE_DRAWER' })}
                    />
                    <div className="fixed inset-y-0 left-0 w-80 bg-white shadow-lg z-50 overflow-y-auto">
                        <div className="p-4">
                            {/* Due Cards Section */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-semibold">Due for Review</h3>
                                    <span className="bg-yellow-100 text-yellow-800 text-sm font-medium px-2.5 py-0.5 rounded">
                                        {getDueCards(state.cardProgress).length}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {getDueCards(state.cardProgress).map(cardId => {
                                        const card = findCardById(state.chapters, cardId);
                                        if (!card) return null;

                                        const progress = state.cardProgress[cardId];
                                        const nextReview = new Date(progress.nextReviewDate);
                                        const isOverdue = nextReview < new Date();

                                        return (
                                            <button
                                                key={cardId}
                                                onClick={() => {
                                                    const action = navigateToCard(cardId, state.chapters);
                                                    if (action) dispatch(action);
                                                }}
                                                className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors"
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="font-medium text-gray-900">{card.chapterTitle}</div>
                                                    <div className={`text-sm px-2 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                                        }`}>
                                                        Level {progress.level}
                                                    </div>
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    Due: {nextReview.toLocaleDateString()}
                                                </div>
                                            </button>
                                        );
                                    })}

                                    {getDueCards(state.cardProgress).length === 0 && (
                                        <div className="text-center py-4 text-gray-500">
                                            No cards due for review! 🎉
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gray-200 my-4" />

                            {/* Chapters Section */}
                            <div>
                                <h2 className="text-xl font-bold mb-4">All Chapters</h2>
                                <div className="space-y-2">
                                    {state.chapters.map((chapter, idx) => (
                                        <button
                                            key={chapter.id}
                                            onClick={() => {
                                                dispatch({
                                                    type: 'SET_PROGRESS',
                                                    payload: {
                                                        currentChapter: idx,
                                                        currentCard: 0,
                                                        isDrawerOpen: false
                                                    }
                                                });
                                            }}
                                            className={`w-full text-left p-3 rounded-lg transition-colors ${idx === state.currentChapter
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="font-medium">{chapter.title}</div>
                                            <div className="text-sm text-gray-600 mt-1">
                                                {chapter.cards.length} cards
                                                {chapter.cards.some(card => getDueCards(state.cardProgress).includes(card.id)) &&
                                                    ' • Has due cards'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default React.memo(LearningViewer);