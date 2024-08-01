import {Component, CUSTOM_ELEMENTS_SCHEMA, NgZone, OnInit} from '@angular/core';
import * as THREE from 'super-three';
import {SpeechSynthesizer} from "../shared/speech-syntesizer.model";
import {FormsModule} from '@angular/forms';
import {HttpClient, HttpHeaders} from "@angular/common/http";
import RecordRTC from 'recordrtc';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AvatarComponent implements OnInit {

  //aframe
  aframe = (window as any).AFRAME;

  speechSyntetiser: SpeechSynthesizer;

  avatarText: string = "Hi there. How are you? I'm fine.";

  meshNameHead: string = 'Wolf3D_Head'
  meshNameTeeth: any = 'Wolf3D_Teeth'

  meshNodeHead: any;
  meshNodeTeeth: any;

  initializedSynthesizer: boolean = false;

  recorder: any;
  isRecordingAudio: boolean = false;
  audioTranscription: string = "";

  urlTextIA = 'textGen AI url there'
  urlAudioIA = 'openAI whisper url there'

  constructor(private ngZone: NgZone, private http: HttpClient) {
  }

  ngOnInit(): void {
    const myComponent = this;


    if (!this.aframe.components['lipsync']) {
      this.aframe.registerComponent('lipsync', {
        schema: {},

        init: function () {
          const el = this.el;
          this.animTime = null;
          // this.tick = myComponent.aframe.utils.throttleTick(this.tick, 30, this);
        },
        tick: function (time, deltaTime) {
          if (!myComponent.speechSyntetiser) return;

          if (myComponent.speechSyntetiser.animQueue.length < 1) {
            this.animTime = null;
            return;
          }

          if (!this.animTime) {
            this.animTime = time;
          }
          const frameTime = (time - this.animTime) + deltaTime;

          for (let i = 0; i < myComponent.speechSyntetiser.animQueue.length; i++) {
            let animationSegment = myComponent.speechSyntetiser.animQueue[i];

            const visemeName = Object.keys(animationSegment.vs)[0]
            const visemeValue = Object.values(animationSegment.vs)[0][1];

            const morphTargetIndexA = myComponent.meshNodeHead.morphTargetDictionary[visemeName];
            const morphTargetIndexB = myComponent.meshNodeTeeth.morphTargetDictionary[visemeName];

            if (frameTime >= animationSegment.ts[0] && frameTime < animationSegment.ts[1]) {

              const animationProgress = Math.max(0, Math.min(1, (frameTime - animationSegment.ts[0]) / (animationSegment.ts[1] - animationSegment.ts[0])));

              if (morphTargetIndexA !== undefined) {
                // Update the morph target influence
                myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = THREE.MathUtils.lerp(myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA], visemeValue, animationProgress);

                //myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = visemeValue;
              }


              if (morphTargetIndexB !== undefined) {
                // Update the morph target influence
                myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = THREE.MathUtils.lerp(myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB], visemeValue, animationProgress);

                //myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = visemeValue;
              }
            }


            if (frameTime >= animationSegment.ts[1] && frameTime < animationSegment.ts[2]) {

              const animationProgress = Math.max(0, Math.min(1, (frameTime - animationSegment.ts[1]) / (animationSegment.ts[2] - animationSegment.ts[1])));

              if (morphTargetIndexA !== undefined) {
                // Update the morph target influence
                myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = THREE.MathUtils.lerp(myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA], 0, animationProgress);

                //myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = visemeValue;
              }


              if (morphTargetIndexB !== undefined) {
                // Update the morph target influence
                myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = THREE.MathUtils.lerp(myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB], 0, animationProgress);

                //myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = visemeValue;
              }
            } else if (frameTime >= animationSegment.ts[2]) {

              if (morphTargetIndexA !== undefined) {
                // Update the morph target influence
                //myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = THREE.MathUtils.lerp(myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA], 0, animationProgress);

                myComponent.meshNodeHead.morphTargetInfluences[morphTargetIndexA] = 0;
              }

              if (morphTargetIndexB !== undefined) {
                // Update the morph target influence
                //myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = THREE.MathUtils.lerp(myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB], 0, animationProgress);

                myComponent.meshNodeTeeth.morphTargetInfluences[morphTargetIndexB] = 0;
              }
              myComponent.speechSyntetiser.animQueue.splice(i, 1);
            }
          }
          if (myComponent.speechSyntetiser.animQueue.length === 0) {
            this.animTime = null;
          }

        }

      });
    }

  }


  initializeSynth() {
    if (!this.initializedSynthesizer) {
      this.initializedSynthesizer = true;

      const player: THREE = document.querySelector('#playerID');
      const playerSound = player.getObject3D("sound").children[0];

      const playerMesh = player.getObject3D("mesh");

      this.meshNodeHead = playerMesh.getObjectByName(this.meshNameHead);
      this.meshNodeTeeth = playerMesh.getObjectByName(this.meshNameTeeth);

      this.speechSyntetiser = new SpeechSynthesizer(playerSound, [this.meshNodeHead, this.meshNodeTeeth]);
    }
  }

  playGoogleAudio(textPrompt: string) {
    this.initializeSynth();
    this.speechSyntetiser.speakText(textPrompt);
  }

  askTextIA(textPrompt: string) {
    this.initializeSynth();
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    const body = {
      "question": textPrompt
    }

    this.http.post(this.urlTextIA, body, {headers: headers}).subscribe(
      (res: any) => {
        this.speechSyntetiser.speakText(res.response);
      },
      (error) => {
        console.error(error);
      }
    )
  }

  registerAndPlayAudio() {
    if (!this.isRecordingAudio) {
      this.registerAudio();
    } else if (this.recorder && this.isRecordingAudio) {
      this.stopRecordingAudio();
    }
  }

  async registerAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      this.recorder = new RecordRTC(stream, {type: 'audio', mimeType: 'audio/wav'});
      this.recorder.startRecording();
      this.isRecordingAudio = true;
    } catch (error) {
      console.error(error);
    }
  }

  stopRecordingAudio() {
    this.recorder.stopRecording(
      () => {
        this.isRecordingAudio = false;
        const audioBlob = this.recorder.getBlob();
        const audioFile = new File([audioBlob], 'recorded_audio.wav', {type: 'audio/wav'});

        const formData = new FormData();
        formData.append('audio', audioFile);

        this.http.post(this.urlAudioIA, formData).subscribe(
          (res: any) => {
            this.audioTranscription = res.text;
            this.initializeSynth();
            this.askTextIA(res.text);
          },
          error => {
            console.error(error);
          }
        );

        this.recorder.reset();
      }
    );
  }

}
